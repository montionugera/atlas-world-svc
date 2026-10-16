// JoyDesign.swift — Shared Joymify Design System for Swift & SwiftUI
//
// Canonical SwiftUI port of:
//  - `joy-design/packages/tokens/src/tokens.json` (Joymify token architecture)
//  - `atlas-world-svc/game-client/src/UI/Design.cs` (Joymify Fantasy Dark preset:
//    Navy #0F1320..#3A4468, Gold #FFD700, Bronze #CD7F32, Warm Sand #F5EFE0..#6B6355)
//
// Designed so every macOS SwiftUI tool (`AtlasObservatory.app`, `joy-companion` macOS HUD,
// and `joy-design/packages/swift`) shares identical tokens, typography, and component primitives.

import AppKit
import SwiftUI

public enum JoyDesign {

    // MARK: - Raw Color Ramps (Palette)

    public enum Palette {
        // Navy — fantasy night backdrop family
        public static let navy950 = Color(hex: 0x0A121F)
        public static let navy900 = Color(hex: 0x0F1320)
        public static let navy800 = Color(hex: 0x1A2036) // brand base bg
        public static let navy700 = Color(hex: 0x232A45) // elevated card surface
        public static let navy600 = Color(hex: 0x2E3757) // interactive / hover surface
        public static let navy500 = Color(hex: 0x3A4468) // structural subtle border

        // Gold — primary call-to-action & active accent
        public static let gold400 = Color(hex: 0xFFE24D)
        public static let gold500 = Color(hex: 0xFFD700) // brand gold
        public static let gold600 = Color(hex: 0xE6C200)

        // Bronze — secondary accent & ornate structural borders
        public static let bronze400 = Color(hex: 0xDDA05A)
        public static let bronze500 = Color(hex: 0xCD7F32) // brand bronze
        public static let bronze600 = Color(hex: 0xA9662A)

        // Sand — warm neutral text hierarchy
        public static let sand50  = Color(hex: 0xF5EFE0)
        public static let sand200 = Color(hex: 0xD8CFBB)
        public static let sand400 = Color(hex: 0xA89F8B)
        public static let sand600 = Color(hex: 0x6B6355)

        // Semantic status feedback
        public static let success = Color(hex: 0x4ADE80)
        public static let danger  = Color(hex: 0xF87171)
        public static let warn    = Color(hex: 0xFBBF24)
        public static let info    = Color(hex: 0x60A5FA)
    }

    // MARK: - Semantic Color Aliases

    public enum Colors {
        public static let background     = Palette.navy800
        public static let surface        = Palette.navy700
        public static let surfaceVariant = Palette.navy600
        public static let well           = Palette.navy900
        public static let scrim          = Palette.navy900.opacity(0.72)

        public static let primary        = Palette.gold500
        public static let primaryHover   = Palette.gold400
        public static let primaryPressed = Palette.gold600
        public static let onPrimary      = Palette.navy900

        public static let secondary      = Palette.bronze500
        public static let secondaryHover = Palette.bronze400

        public static let textPrimary    = Palette.sand50
        public static let textSecondary  = Palette.sand400
        public static let textMuted      = Palette.sand600
        public static let textDisabled   = Palette.sand400.opacity(0.45)

        public static let border         = Palette.navy500
        public static let borderStrong   = Palette.bronze500
        public static let focusRing      = Palette.gold500

        public static let success        = Palette.success
        public static let danger         = Palette.danger
        public static let warn           = Palette.warn
        public static let info           = Palette.info
    }

    // MARK: - 4pt Spacing Scale

    public enum Space {
        public static let s1: CGFloat = 4
        public static let s2: CGFloat = 8
        public static let s3: CGFloat = 12
        public static let s4: CGFloat = 16
        public static let s5: CGFloat = 24
        public static let s6: CGFloat = 32
    }

    // MARK: - Corner Radii

    public enum Radius {
        public static let r1: CGFloat = 6
        public static let r2: CGFloat = 10
        public static let r3: CGFloat = 16
    }

    // MARK: - Type Scale

    public enum Typography {
        public static let display = Font.system(size: 32, weight: .heavy, design: .rounded)
        public static let h1      = Font.system(size: 22, weight: .bold, design: .rounded)
        public static let h2      = Font.system(size: 16, weight: .bold, design: .rounded)
        public static let body    = Font.system(size: 14, weight: .regular, design: .default)
        public static let caption = Font.system(size: 12, weight: .medium, design: .default)
        public static let value   = Font.system(size: 15, weight: .semibold, design: .monospaced)
        public static let mono    = Font.system(size: 12, weight: .regular, design: .monospaced)
        public static let monoBold = Font.system(size: 12, weight: .bold, design: .monospaced)
    }

    // MARK: - Badge Tone

    public enum BadgeTone {
        case gold
        case bronze
        case success
        case danger
        case warn
        case info
        case neutral

        public var foreground: Color {
            switch self {
            case .gold:    return Palette.gold500
            case .bronze:  return Palette.bronze400
            case .success: return Palette.success
            case .danger:  return Palette.danger
            case .warn:    return Palette.warn
            case .info:    return Palette.info
            case .neutral: return Palette.sand200
            }
        }

        public var background: Color {
            foreground.opacity(0.16)
        }

        public var border: Color {
            foreground.opacity(0.42)
        }
    }
}

// MARK: - Hex Color Initializer

public extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

// MARK: - Reusable SwiftUI Components (JoyCard, JoyWell, JoyBadge, JoyKpiTile, Buttons)

public struct JoyBadge: View {
    public let text: String
    public var tone: JoyDesign.BadgeTone = .gold

    public init(_ text: String, tone: JoyDesign.BadgeTone = .gold) {
        self.text = text
        self.tone = tone
    }

    public var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .foregroundColor(tone.foreground)
            .padding(.horizontal, JoyDesign.Space.s2)
            .padding(.vertical, 3)
            .background(tone.background)
            .overlay(
                Capsule().stroke(tone.border, lineWidth: 1)
            )
            .clipShape(Capsule())
    }
}

public struct JoyCard<Content: View>: View {
    public let title: String?
    public let badgeText: String?
    public let badgeTone: JoyDesign.BadgeTone
    public let strongBorder: Bool
    @ViewBuilder public let content: () -> Content

    public init(
        title: String? = nil,
        badge: String? = nil,
        badgeTone: JoyDesign.BadgeTone = .bronze,
        strongBorder: Bool = false,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.badgeText = badge
        self.badgeTone = badgeTone
        self.strongBorder = strongBorder
        self.content = content
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: JoyDesign.Space.s2) {
            if title != nil || badgeText != nil {
                HStack(spacing: JoyDesign.Space.s2) {
                    if let title = title {
                        Text(title)
                            .font(JoyDesign.Typography.h2)
                            .foregroundColor(JoyDesign.Colors.textPrimary)
                    }
                    Spacer()
                    if let badgeText = badgeText {
                        JoyBadge(badgeText, tone: badgeTone)
                    }
                }
                Rectangle()
                    .fill(JoyDesign.Colors.border.opacity(0.6))
                    .frame(height: 1)
            }
            content()
        }
        .padding(JoyDesign.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(JoyDesign.Colors.surface)
        .cornerRadius(JoyDesign.Radius.r2)
        .overlay(
            RoundedRectangle(cornerRadius: JoyDesign.Radius.r2)
                .stroke(
                    strongBorder ? JoyDesign.Colors.borderStrong : JoyDesign.Colors.border,
                    lineWidth: strongBorder ? 1.5 : 1.0
                )
        )
    }
}

public struct JoyWell<Content: View>: View {
    @ViewBuilder public let content: () -> Content

    public init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    public var body: some View {
        content()
            .padding(JoyDesign.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(JoyDesign.Colors.well)
            .cornerRadius(JoyDesign.Radius.r1)
            .overlay(
                RoundedRectangle(cornerRadius: JoyDesign.Radius.r1)
                    .stroke(JoyDesign.Colors.border.opacity(0.8), lineWidth: 1)
            )
    }
}

public struct JoyKpiTile: View {
    public let label: String
    public let value: String
    public let subtitle: String
    public var accentTone: JoyDesign.BadgeTone = .gold

    public init(
        label: String,
        value: String,
        subtitle: String,
        accentTone: JoyDesign.BadgeTone = .gold
    ) {
        self.label = label
        self.value = value
        self.subtitle = subtitle
        self.accentTone = accentTone
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: JoyDesign.Space.s1) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundColor(JoyDesign.Colors.textSecondary)
            Text(value)
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .foregroundColor(JoyDesign.Colors.primary)
            Text(subtitle)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(accentTone.foreground)
        }
        .padding(JoyDesign.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(JoyDesign.Colors.surface)
        .cornerRadius(JoyDesign.Radius.r2)
        .overlay(
            RoundedRectangle(cornerRadius: JoyDesign.Radius.r2)
                .stroke(JoyDesign.Colors.borderStrong.opacity(0.55), lineWidth: 1)
        )
    }
}

public struct JoyPrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundColor(JoyDesign.Colors.onPrimary)
            .padding(.horizontal, JoyDesign.Space.s3)
            .padding(.vertical, 6)
            .background(
                configuration.isPressed
                    ? JoyDesign.Colors.primaryPressed
                    : JoyDesign.Colors.primary
            )
            .cornerRadius(JoyDesign.Radius.r1)
            .overlay(
                RoundedRectangle(cornerRadius: JoyDesign.Radius.r1)
                    .stroke(JoyDesign.Palette.gold400, lineWidth: 1)
            )
    }
}

public struct JoyGhostButtonStyle: ButtonStyle {
    public var isActive: Bool = false

    public init(isActive: Bool = false) {
        self.isActive = isActive
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundColor(isActive ? JoyDesign.Colors.primary : JoyDesign.Colors.textPrimary)
            .padding(.horizontal, JoyDesign.Space.s3)
            .padding(.vertical, 6)
            .background(
                configuration.isPressed || isActive
                    ? JoyDesign.Colors.surfaceVariant
                    : JoyDesign.Colors.surface
            )
            .cornerRadius(JoyDesign.Radius.r1)
            .overlay(
                RoundedRectangle(cornerRadius: JoyDesign.Radius.r1)
                    .stroke(
                        isActive ? JoyDesign.Colors.primary : JoyDesign.Colors.border,
                        lineWidth: 1
                    )
            )
    }
}
