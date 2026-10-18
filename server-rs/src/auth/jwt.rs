use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

/// Default session encryption key matching `nakama/local.yml` (`session.encryption_key`).
/// Compiled in only under `cfg(debug_assertions)`.
#[cfg(debug_assertions)]
pub const DEFAULT_DEV_SESSION_SECRET: &str = "atlas_dev_session_key_change_me_please_32";

/// JWT Claims payload matching both Nakama client session JWTs (`uid`, `usn`, `tid`, `exp`)
/// and internal S2S/test tokens (`sub`, `username`, `exp`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Claims {
    #[serde(alias = "uid")]
    pub sub: String,
    pub exp: usize,
    #[serde(alias = "usn", skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

/// Raw Nakama client session JWT payload (`authenticate/device` / `authenticate/email`).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct NakamaSessionClaims<'a> {
    tid: &'a str,
    uid: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    usn: Option<&'a str>,
    exp: usize,
}

/// Authentication error types.
#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    MissingToken,
    Expired,
    InvalidToken(String),
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingToken => write!(f, "Missing authentication token"),
            Self::Expired => write!(f, "Authentication token has expired"),
            Self::InvalidToken(reason) => write!(f, "Invalid authentication token: {}", reason),
        }
    }
}

impl std::error::Error for AuthError {}

fn non_empty(val: Option<&str>) -> Option<String> {
    val.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

/// JWT authentication guard verifying player and server session tokens.
#[derive(Clone)]
pub struct AuthGuard {
    secret: Vec<u8>,
    #[cfg(debug_assertions)]
    allow_dev_token: bool,
}

impl AuthGuard {
    pub fn new(secret: Vec<u8>) -> Self {
        Self {
            secret,
            #[cfg(debug_assertions)]
            allow_dev_token: true,
        }
    }

    /// Creates an [`AuthGuard`] with `dev-token` bypass disabled (matching release builds).
    pub fn new_strict(secret: Vec<u8>) -> Self {
        Self {
            secret,
            #[cfg(debug_assertions)]
            allow_dev_token: false,
        }
    }

    /// Parses the signing secret strictly from environment variable values without any
    /// compiled-in fallback secret.
    pub fn from_vars_strict(
        session_key: Option<&str>,
        server_key: Option<&str>,
        jwt_secret: Option<&str>,
    ) -> Result<Self, AuthError> {
        let secret = non_empty(session_key)
            .or_else(|| non_empty(server_key))
            .or_else(|| non_empty(jwt_secret))
            .ok_or_else(|| {
                AuthError::InvalidToken(
                    "Missing JWT signing secret (set NAKAMA_SESSION_KEY, NAKAMA_SERVER_KEY, or JWT_SECRET)"
                        .to_string(),
                )
            })?;
        Ok(Self::new_strict(secret.into_bytes()))
    }

    pub fn from_env() -> Self {
        let session_key = std::env::var("NAKAMA_SESSION_KEY").ok();
        let server_key = std::env::var("NAKAMA_SERVER_KEY").ok();
        let jwt_secret = std::env::var("JWT_SECRET").ok();

        #[cfg(debug_assertions)]
        {
            match Self::from_vars_strict(
                session_key.as_deref(),
                server_key.as_deref(),
                jwt_secret.as_deref(),
            ) {
                Ok(guard) => Self::new(guard.secret),
                Err(_) => Self::new(DEFAULT_DEV_SESSION_SECRET.as_bytes().to_vec()),
            }
        }

        #[cfg(not(debug_assertions))]
        {
            Self::from_vars_strict(
                session_key.as_deref(),
                server_key.as_deref(),
                jwt_secret.as_deref(),
            )
            .expect(
                "Missing JWT signing secret in release build (set NAKAMA_SESSION_KEY, NAKAMA_SERVER_KEY, or JWT_SECRET)",
            )
        }
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims, AuthError> {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(AuthError::MissingToken);
        }

        // Allow dev-token bypass only in debug builds when not in strict mode.
        #[cfg(debug_assertions)]
        if self.allow_dev_token && (trimmed == "dev-token" || trimmed.starts_with("dev-token:")) {
            let user_id = trimmed
                .strip_prefix("dev-token:")
                .unwrap_or("dev-player")
                .trim();
            let effective_id = if user_id.is_empty() {
                "dev-player"
            } else {
                user_id
            };
            return Ok(Claims {
                sub: effective_id.to_string(),
                exp: usize::MAX,
                username: Some(effective_id.to_string()),
            });
        }

        let decoding_key = DecodingKey::from_secret(&self.secret);
        let mut validation = Validation::default();
        validation.validate_exp = true;
        validation.leeway = 0;

        match decode::<Claims>(trimmed, &decoding_key, &validation) {
            Ok(token_data) => {
                if token_data.claims.sub.trim().is_empty() {
                    return Err(AuthError::InvalidToken(
                        "Token user id claim (sub/uid) is empty".to_string(),
                    ));
                }
                Ok(token_data.claims)
            }
            Err(err) => {
                if let jsonwebtoken::errors::ErrorKind::ExpiredSignature = err.kind() {
                    Err(AuthError::Expired)
                } else {
                    Err(AuthError::InvalidToken(err.to_string()))
                }
            }
        }
    }

    pub fn generate_test_token(
        &self,
        user_id: &str,
        username: &str,
        exp_offset_sec: i64,
    ) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs() as i64;
        let exp = (now + exp_offset_sec).max(0) as usize;

        let claims = Claims {
            sub: user_id.to_string(),
            exp,
            username: if username.is_empty() {
                None
            } else {
                Some(username.to_string())
            },
        };

        let encoding_key = EncodingKey::from_secret(&self.secret);
        encode(&Header::default(), &claims, &encoding_key).expect("Failed to encode test JWT")
    }

    /// Generates a JWT with the exact claim layout Nakama emits (`tid`, `uid`, `usn`, `exp`).
    pub fn generate_nakama_token(
        &self,
        uid: &str,
        usn: &str,
        tid: &str,
        exp_offset_sec: i64,
    ) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs() as i64;
        let exp = (now + exp_offset_sec).max(0) as usize;

        let claims = NakamaSessionClaims {
            tid,
            uid,
            usn: if usn.is_empty() { None } else { Some(usn) },
            exp,
        };

        let encoding_key = EncodingKey::from_secret(&self.secret);
        encode(&Header::default(), &claims, &encoding_key)
            .expect("Failed to encode Nakama session JWT")
    }

    /// Issues a signed Nakama-compatible session JWT with a freshly generated UUIDv4 `tid`.
    pub fn issue_session_token(&self, uid: &str, usn: &str, exp_offset_sec: i64) -> String {
        let tid = crate::meta::generate_uuid_v4();
        self.generate_nakama_token(uid, usn, &tid, exp_offset_sec)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_token_verification() {
        let guard = AuthGuard::new(b"test_secret_key_12345".to_vec());
        let token = guard.generate_test_token("usr-42", "legend", 3600);

        let claims = guard.validate_token(&token).expect("Token should be valid");
        assert_eq!(claims.sub, "usr-42");
        assert_eq!(claims.username.as_deref(), Some("legend"));
        assert!(claims.exp > 0);
    }

    #[test]
    fn test_nakama_device_token_claim_mapping() {
        let secret = b"atlas_dev_session_key_change_me_please_32".to_vec();
        let guard = AuthGuard::new_strict(secret);
        let token = guard.generate_nakama_token(
            "e560e7e0-6767-4287-bb3c-e89b555659a4",
            "GkLijrIgcc",
            "a7245236-451d-4184-8556-cdd8371014ce",
            7200,
        );

        let claims = guard
            .validate_token(&token)
            .expect("Nakama session token with uid/usn/tid must be accepted");
        assert_eq!(claims.sub, "e560e7e0-6767-4287-bb3c-e89b555659a4");
        assert_eq!(claims.username.as_deref(), Some("GkLijrIgcc"));
    }

    #[test]
    fn test_issue_session_token_roundtrip() {
        let guard = AuthGuard::new_strict(b"atlas_dev_session_key_change_me_please_32".to_vec());
        let token =
            guard.issue_session_token("00000000-0000-4000-8000-000000000077", "player_abc", 7200);
        let claims = guard.validate_token(&token).unwrap();
        assert_eq!(claims.sub, "00000000-0000-4000-8000-000000000077");
        assert_eq!(claims.username.as_deref(), Some("player_abc"));
    }

    #[test]
    fn test_strict_release_mode_rejects_dev_token_and_missing_secret() {
        let guard = AuthGuard::new_strict(b"prod_secret_key_32_bytes_minimum!".to_vec());
        assert!(matches!(
            guard.validate_token("dev-token"),
            Err(AuthError::InvalidToken(_))
        ));
        assert!(matches!(
            guard.validate_token("dev-token:00000000-0000-4000-8000-000000000001"),
            Err(AuthError::InvalidToken(_))
        ));

        assert!(AuthGuard::from_vars_strict(None, None, None).is_err());
        assert!(AuthGuard::from_vars_strict(Some("  "), Some(""), None).is_err());
        assert!(AuthGuard::from_vars_strict(
            None,
            Some("atlas_dev_session_key_change_me_please_32"),
            None
        )
        .is_ok());
    }

    #[test]
    fn test_expired_token_rejection() {
        let guard = AuthGuard::new(b"test_secret_key_12345".to_vec());
        let expired_token = guard.generate_test_token("usr-expired", "old_timer", -300);

        let err = guard
            .validate_token(&expired_token)
            .expect_err("Expired token must fail");
        assert_eq!(err, AuthError::Expired);
    }

    #[test]
    fn test_tampered_token_rejection() {
        let guard = AuthGuard::new(b"test_secret_key_12345".to_vec());
        let token = guard.generate_test_token("usr-valid", "good_guy", 3600);

        // Tamper with payload or signature
        let mut tampered = token.into_bytes();
        let len = tampered.len();
        tampered[len - 5] ^= 0x42; // flip bits
        let tampered_str = String::from_utf8_lossy(&tampered);

        let err = guard
            .validate_token(&tampered_str)
            .expect_err("Tampered token must fail");
        assert!(matches!(err, AuthError::InvalidToken(_)));
    }

    #[test]
    fn test_wrong_secret_rejection() {
        let guard_a = AuthGuard::new(b"secret_a".to_vec());
        let guard_b = AuthGuard::new(b"secret_b".to_vec());

        let token = guard_a.generate_test_token("usr-1", "user", 3600);
        let err = guard_b
            .validate_token(&token)
            .expect_err("Token signed with secret A should fail on guard B");
        assert!(matches!(err, AuthError::InvalidToken(_)));
    }

    #[test]
    fn test_missing_or_empty_token() {
        let guard = AuthGuard::new(b"test_secret".to_vec());
        assert_eq!(
            guard.validate_token("").unwrap_err(),
            AuthError::MissingToken
        );
        assert_eq!(
            guard.validate_token("   ").unwrap_err(),
            AuthError::MissingToken
        );
    }

    #[cfg(debug_assertions)]
    #[test]
    fn test_dev_token_bypass() {
        let guard = AuthGuard::new(b"any_secret".to_vec());
        let claims = guard.validate_token("dev-token").expect("dev-token bypass");
        assert_eq!(claims.sub, "dev-player");

        let claims2 = guard
            .validate_token("dev-token:alice")
            .expect("dev-token with suffix");
        assert_eq!(claims2.sub, "alice");
    }
}
