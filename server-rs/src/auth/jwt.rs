use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

/// JWT Claims payload matching Nakama S2S conventions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
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

/// JWT authentication guard verifying player and server session tokens.
#[derive(Clone)]
pub struct AuthGuard {
    secret: Vec<u8>,
}

impl AuthGuard {
    pub fn new(secret: Vec<u8>) -> Self {
        Self { secret }
    }

    pub fn from_env() -> Self {
        let secret = std::env::var("NAKAMA_SERVER_KEY")
            .or_else(|_| std::env::var("JWT_SECRET"))
            .unwrap_or_else(|_| "default_nakama_jwt_dev_secret_key_32b!".to_string());
        Self::new(secret.into_bytes())
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims, AuthError> {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(AuthError::MissingToken);
        }

        // Allow dev-token bypass for local development and testing
        if trimmed == "dev-token" || trimmed.starts_with("dev-token:") {
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

        match decode::<Claims>(token, &decoding_key, &validation) {
            Ok(token_data) => Ok(token_data.claims),
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
