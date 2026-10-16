// Atlas World — Native macOS Observatory App (tools/mac-observatory/AtlasObservatoryApp.swift)
//
// Zero-dependency native macOS arm64 SwiftUI + SQLite3 + JoyDesign application.
// Compiles in ~2.5s via `scripts/build_mac_observatory.sh` into `build/AtlasObservatory.app`.
//
// Features:
// 1. Powered by `JoyDesign.swift` (shared Joymify Fantasy Design System: Navy/Gold/Bronze/Sand)
// 2. Native SwiftUI NavigationSplitView with instant Global Search (Cmd+F) across all MMORPG domains
// 3. Direct C-ABI `sqlite3` reader on `build/catalog.sqlite` + JSON reader on `contracts/content/*.json`
// 4. Interactive Tabs:
//    - Overview & Cross-Repo Asset Studio Index (`v_asset_studio_entries`)
//    - Jobs & Class Hierarchy (`jobs.json`)
//    - Bestiary, Drop Tables & EXP/HP Economy (`mobs.json`)
//    - 10-Element Counter Matrix & Weapon-vs-Size Table (`elements.json`)
//    - Monster Cards & Adventurer Handbook Milestones (`cards.json`, `handbook.json`)
//    - Unified 6-Category Quest Board (`quest_board.json`)
//    - War of Emperium (GvG Castle Siege) Breach & TTK Simulator (`castles.json`)
//    - Live Read-Only SQLite Query Studio (`build/catalog.sqlite`)
//    - Architecture Specs & Lore Canon Reader (`docs/superpowers/specs/*.md`, `content/story/canon.md`)
// 5. 1-Click Toolbar Actions:
//    - "⟳ Rebuild SQLite DB" (`scripts/build_catalog_db.py`)
//    - "▶ Run Balance Sim" (`cargo run --bin balance_sim`)

import AppKit
import Foundation
import SQLite3
import SwiftUI

// MARK: - Models

struct JobEntry: Identifiable, Decodable {
    let id: String
    let name: String
    let tier: Int
    let parentJobId: String?
    let minBaseLevel: Int
    let maxJobLevel: Int
    let jobChangeQuestId: String?
    let primaryStats: [String]
    let allowedWeaponKinds: [String]
    let jobBonusAtMax: [String: Int]
    let unlockedSkillIds: [String]
    let assetStudioKey: String
}

struct MobDrop: Decodable {
    let itemId: String
    let chanceBps: Int
}

struct MobEntry: Identifiable, Decodable {
    let id: String
    let name: String
    let level: Int
    let rank: String
    let element: String
    let race: String
    let size: String
    let isMvp: Bool
    let hp: Int
    let pAtk: Int
    let pDef: Int
    let baseExp: Int
    let jobExp: Int
    let aggroRangeM: Double
    let leashRangeM: Double
    let spawnZones: [String]
    let drops: [MobDrop]
    let cardId: String?
    let assetStudioKey: String
}

struct CardEntry: Identifiable, Decodable {
    let id: String
    let name: String
    let slot: String
    let mobId: String
    let equipStats: [String: Int]
    let handbookDepositStats: [String: Int]
    let assetStudioKey: String
}

struct HandbookTier: Decodable {
    let requiredCount: Int
    let unlockNote: String
    let bonusStat: String
    let bonusValue: Int
}

struct HandbookEntry: Identifiable, Decodable {
    let id: String
    let category: String
    let title: String
    let targetId: String
    let tiers: [HandbookTier]
}

struct QuestObjective: Decodable {
    let id: String
    let type: String
    let targetId: String
    let required: Int
}

struct QuestRewards: Decodable {
    let baseXp: Int
    let jobXp: Int
    let unlockJobId: String?
    let unlockSkillId: String?
    let reputation: Int
}

struct QuestEntry: Identifiable, Decodable {
    let id: String
    let title: String
    let category: String
    let minBaseLevel: Int
    let requiredJobId: String?
    let giverNpcId: String
    let zoneId: String
    let repeatable: Bool
    let objectives: [QuestObjective]
    let rewards: QuestRewards
}

struct CastleEmperium: Decodable {
    let hp: Int
    let element: String
    let race: String
    let size: String
    let onlyNormalAttackDamage: Bool
}

struct CastleFortifications: Decodable {
    let outerGateBarricadeCount: Int
    let innerGateBarricadeCount: Int
    let guardianStoneCount: Int
    let barricadeHp: Int
}

struct CastlePvpRules: Decodable {
    let playerDamageScalingPct: Int
    let rangedDamageInSiegePct: Int
    let knockbackDisabled: Bool
    let consumableCooldownMs: Int
}

struct CastleOwnerRewards: Decodable {
    let dailyTreasureChestCount: Int
    let guildDungeonZoneId: String
    let townTaxShareBps: Int
}

struct CastleEntry: Identifiable, Decodable {
    let id: String
    let name: String
    let hubTownId: String
    let siegeMapId: String
    let siegeDurationMinutes: Int
    let maxGuildSize: Int
    let emperium: CastleEmperium
    let fortifications: CastleFortifications
    let pvpRules: CastlePvpRules
    let ownerRewards: CastleOwnerRewards
    let assetStudioKey: String
}

struct ElementsCatalog: Decodable {
    let elements: [String]
    let damageMatrixPct: [String: [String: Int]]
    let weaponSizePenaltyPct: [String: [String: Int]]
}

struct DocFile: Identifiable {
    let id: String
    let title: String
    let relativePath: String
    let content: String
}

struct SqlQueryResult {
    var columns: [String] = []
    var rows: [[String]] = []
    var error: String? = nil
}

enum SidebarSection: String, CaseIterable, Identifiable {
    case overview = "Overview & Search"
    case jobs = "Jobs & Promotions"
    case mobs = "Bestiary & Drops"
    case elements = "10-Element & Size"
    case cards = "Cards & Handbook"
    case quests = "Quest Board"
    case siege = "WoE Castle Siege"
    case sql = "SQLite Query Studio"
    case sim = "Rust Balance Sim"
    case docs = "Specs & Lore Canon"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2.fill"
        case .jobs: return "person.crop.rectangle.stack.fill"
        case .mobs: return "flame.fill"
        case .elements: return "sparkles"
        case .cards: return "rectangle.stack.badge.plus"
        case .quests: return "scroll.fill"
        case .siege: return "shield.checkered"
        case .sql: return "cylinder.split.1x2.fill"
        case .sim: return "chart.xyaxis.line"
        case .docs: return "book.closed.fill"
        }
    }
}

// MARK: - Store

final class ObservatoryStore: ObservableObject {
    @Published var repoRoot: URL
    @Published var jobs: [JobEntry] = []
    @Published var mobs: [MobEntry] = []
    @Published var cards: [CardEntry] = []
    @Published var handbook: [HandbookEntry] = []
    @Published var quests: [QuestEntry] = []
    @Published var castles: [CastleEntry] = []
    @Published var elements = ElementsCatalog(elements: [], damageMatrixPct: [:], weaponSizePenaltyPct: [:])
    @Published var docs: [DocFile] = []
    @Published var statusBanner: String = "Ready"
    @Published var balanceSimOutput: String = "Click '▶ Run Balance Sim' to execute `cargo run --bin balance_sim`."

    init() {
        if let envRoot = ProcessInfo.processInfo.environment["ATLAS_REPO_ROOT"] {
            self.repoRoot = URL(fileURLWithPath: envRoot)
        } else {
            let execURL = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
            let candidate = execURL
                .deletingLastPathComponent() // MacOS
                .deletingLastPathComponent() // Contents
                .deletingLastPathComponent() // AtlasObservatory.app
                .deletingLastPathComponent() // build
                .deletingLastPathComponent() // repoRoot
            if FileManager.default.fileExists(atPath: candidate.appendingPathComponent("contracts/content/jobs.json").path) {
                self.repoRoot = candidate
            } else {
                self.repoRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            }
        }
        reloadAll()
    }

    func reloadAll() {
        let contentDir = repoRoot.appendingPathComponent("contracts/content")
        jobs = loadJson(contentDir.appendingPathComponent("jobs.json")) ?? []
        mobs = loadJson(contentDir.appendingPathComponent("mobs.json")) ?? []
        cards = loadJson(contentDir.appendingPathComponent("cards.json")) ?? []
        handbook = loadJson(contentDir.appendingPathComponent("handbook.json")) ?? []
        quests = loadJson(contentDir.appendingPathComponent("quest_board.json")) ?? []
        castles = loadJson(contentDir.appendingPathComponent("castles.json")) ?? []
        if let el: ElementsCatalog = loadJson(contentDir.appendingPathComponent("elements.json")) {
            elements = el
        }
        loadDocs()
        statusBanner = "Loaded \(jobs.count) Jobs, \(mobs.count) Mobs, \(cards.count) Cards, \(quests.count) Quests, \(castles.count) Castles"
    }

    private func loadJson<T: Decodable>(_ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func loadDocs() {
        var list: [DocFile] = []
        let specsDir = repoRoot.appendingPathComponent("docs/superpowers/specs")
        if let files = try? FileManager.default.contentsOfDirectory(at: specsDir, includingPropertiesForKeys: nil) {
            for f in files.filter({ $0.pathExtension == "md" }).sorted(by: { $0.lastPathComponent > $1.lastPathComponent }) {
                if let text = try? String(contentsOf: f, encoding: .utf8) {
                    list.append(DocFile(
                        id: f.lastPathComponent,
                        title: f.deletingPathExtension().lastPathComponent,
                        relativePath: "docs/superpowers/specs/\(f.lastPathComponent)",
                        content: text
                    ))
                }
            }
        }
        let canonURL = repoRoot.appendingPathComponent("content/story/canon.md")
        if let text = try? String(contentsOf: canonURL, encoding: .utf8) {
            list.append(DocFile(
                id: "canon.md",
                title: "World Lore Canon (canon.md)",
                relativePath: "content/story/canon.md",
                content: text
            ))
        }
        docs = list
    }

    func rebuildSqliteCatalog() {
        let script = repoRoot.appendingPathComponent("scripts/build_catalog_db.py").path
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        proc.arguments = [script]
        proc.currentDirectoryURL = repoRoot
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        do {
            try proc.run()
            proc.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let msg = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "Rebuilt SQLite DB"
            reloadAll()
            statusBanner = msg
        } catch {
            statusBanner = "Rebuild failed: \(error.localizedDescription)"
        }
    }

    func runBalanceSim() {
        statusBanner = "Running server-rs balance_sim..."
        let root = repoRoot
        DispatchQueue.global(qos: .userInitiated).async {
            let proc = Process()
            let cargoBin = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".cargo/bin/cargo").path
            proc.executableURL = URL(fileURLWithPath: FileManager.default.fileExists(atPath: cargoBin) ? cargoBin : "/usr/bin/env")
            if FileManager.default.fileExists(atPath: cargoBin) {
                proc.arguments = ["run", "--quiet", "--manifest-path", root.appendingPathComponent("server-rs/Cargo.toml").path, "--bin", "balance_sim"]
            } else {
                proc.arguments = ["cargo", "run", "--quiet", "--manifest-path", root.appendingPathComponent("server-rs/Cargo.toml").path, "--bin", "balance_sim"]
            }
            proc.currentDirectoryURL = root
            let pipe = Pipe()
            proc.standardOutput = pipe
            proc.standardError = pipe
            do {
                try proc.run()
                proc.waitUntilExit()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let out = String(data: data, encoding: .utf8) ?? "(no output)"
                DispatchQueue.main.async {
                    self.balanceSimOutput = out
                    self.statusBanner = "Finished balance_sim (exit \(proc.terminationStatus))"
                }
            } catch {
                DispatchQueue.main.async {
                    self.balanceSimOutput = "Failed to run balance_sim: \(error.localizedDescription)"
                    self.statusBanner = "balance_sim error"
                }
            }
        }
    }

    func runSqliteQuery(_ sql: String) -> SqlQueryResult {
        let dbPath = repoRoot.appendingPathComponent("build/catalog.sqlite").path
        if !FileManager.default.fileExists(atPath: dbPath) {
            rebuildSqliteCatalog()
        }
        let clean = sql.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            return SqlQueryResult(error: "Query is empty.")
        }
        let firstWord = clean.components(separatedBy: .whitespacesAndNewlines).first?.uppercased() ?? ""
        guard ["SELECT", "WITH", "PRAGMA", "EXPLAIN"].contains(firstWord) else {
            return SqlQueryResult(error: "Only read-only SELECT / WITH / PRAGMA / EXPLAIN queries are permitted.")
        }

        var db: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
            let err = db != nil ? String(cString: sqlite3_errmsg(db)) : "Unable to open catalog.sqlite"
            sqlite3_close(db)
            return SqlQueryResult(error: err)
        }
        defer { sqlite3_close(db) }

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, clean, -1, &stmt, nil) == SQLITE_OK else {
            let err = String(cString: sqlite3_errmsg(db))
            return SqlQueryResult(error: err)
        }
        defer { sqlite3_finalize(stmt) }

        let colCount = Int(sqlite3_column_count(stmt))
        var cols: [String] = []
        for c in 0..<colCount {
            if let namePtr = sqlite3_column_name(stmt, Int32(c)) {
                cols.append(String(cString: namePtr))
            } else {
                cols.append("col_\(c)")
            }
        }

        var rows: [[String]] = []
        while sqlite3_step(stmt) == SQLITE_ROW && rows.count < 250 {
            var row: [String] = []
            for c in 0..<colCount {
                if let ptr = sqlite3_column_text(stmt, Int32(c)) {
                    row.append(String(cString: ptr))
                } else {
                    row.append("NULL")
                }
            }
            rows.append(row)
        }

        return SqlQueryResult(columns: cols, rows: rows, error: nil)
    }
}

// MARK: - Views (JoyDesign Fantasy System)

struct MainObservatoryView: View {
    @StateObject private var store = ObservatoryStore()
    @State private var selection: SidebarSection? = .overview
    @State private var searchText: String = ""
    @State private var sqlText: String = "SELECT * FROM v_mob_economy;"
    @State private var sqlResult = SqlQueryResult()
    @State private var siegeAttackers: Double = 15
    @State private var siegeDps: Double = 620
    @State private var selectedDocId: String = ""

    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: JoyDesign.Space.s2) {
                HStack(spacing: JoyDesign.Space.s2) {
                    Circle()
                        .fill(JoyDesign.Colors.primary)
                        .frame(width: 9, height: 9)
                    Text("JOY DESIGN · SWIFT")
                        .font(.system(size: 11, weight: .heavy, design: .monospaced))
                        .foregroundColor(JoyDesign.Colors.primary)
                }
                .padding(.horizontal, JoyDesign.Space.s3)
                .padding(.top, JoyDesign.Space.s3)

                List(SidebarSection.allCases, selection: $selection) { sec in
                    Label(sec.rawValue, systemImage: sec.icon)
                        .font(.system(size: 13, weight: selection == sec ? .bold : .medium))
                        .foregroundColor(selection == sec ? JoyDesign.Colors.primary : JoyDesign.Colors.textPrimary)
                        .tag(sec)
                }
                .scrollContentBackground(.hidden)
            }
            .background(JoyDesign.Colors.well)
            .navigationSplitViewColumnWidth(min: 210, ideal: 225, max: 255)
        } detail: {
            VStack(spacing: 0) {
                topBar
                Rectangle()
                    .fill(JoyDesign.Colors.borderStrong.opacity(0.45))
                    .frame(height: 1)
                ScrollView {
                    VStack(alignment: .leading, spacing: JoyDesign.Space.s5) {
                        detailBody
                    }
                    .padding(JoyDesign.Space.s5)
                }
            }
            .background(JoyDesign.Colors.background)
            .foregroundColor(JoyDesign.Colors.textPrimary)
        }
        .preferredColorScheme(.dark)
        .searchable(text: $searchText, placement: .toolbar, prompt: "Search Jobs, Mobs, Cards, Quests, Castles...")
        .onAppear {
            sqlResult = store.runSqliteQuery(sqlText)
            selectedDocId = store.docs.first?.id ?? ""
        }
    }

    private var topBar: some View {
        HStack(spacing: JoyDesign.Space.s3) {
            JoyBadge("ATLAS WORLD OBSERVATORY", tone: .gold)
            JoyBadge("JoyDesign v1", tone: .bronze)

            Text(store.statusBanner)
                .font(JoyDesign.Typography.mono)
                .foregroundColor(JoyDesign.Colors.textSecondary)
                .lineLimit(1)

            Spacer()

            Button("⟳ Rebuild SQLite DB") {
                store.rebuildSqliteCatalog()
                sqlResult = store.runSqliteQuery(sqlText)
            }
            .buttonStyle(JoyGhostButtonStyle())

            Button("▶ Run Balance Sim") {
                selection = .sim
                store.runBalanceSim()
            }
            .buttonStyle(JoyPrimaryButtonStyle())
        }
        .padding(.horizontal, JoyDesign.Space.s4)
        .padding(.vertical, JoyDesign.Space.s3)
        .background(JoyDesign.Colors.well)
    }

    @ViewBuilder
    private var detailBody: some View {
        switch selection ?? .overview {
        case .overview:
            overviewSection
        case .jobs:
            jobsSection
        case .mobs:
            mobsSection
        case .elements:
            elementsSection
        case .cards:
            cardsSection
        case .quests:
            questsSection
        case .siege:
            siegeSection
        case .sql:
            sqlSection
        case .sim:
            simSection
        case .docs:
            docsSection
        }
    }

    private func matches(_ text: String) -> Bool {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty { return true }
        return text.lowercased().contains(q)
    }

    private var overviewSection: some View {
        VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: JoyDesign.Space.s3)], spacing: JoyDesign.Space.s3) {
                JoyKpiTile(label: "Job Classes", value: "\(store.jobs.count)", subtitle: "Tier 0 → Tier 2", accentTone: .gold)
                JoyKpiTile(label: "Monsters & MVPs", value: "\(store.mobs.count)", subtitle: "10-Element Indexed", accentTone: .danger)
                JoyKpiTile(label: "Monster Cards", value: "\(store.cards.count)", subtitle: "Socket + Handbook", accentTone: .success)
                JoyKpiTile(label: "Quest Board", value: "\(store.quests.count)", subtitle: "6 Categories", accentTone: .info)
                JoyKpiTile(label: "GvG Castles", value: "\(store.castles.count)", subtitle: "Kriemhild (WoE)", accentTone: .bronze)
                JoyKpiTile(label: "Specs & Canon", value: "\(store.docs.count)", subtitle: "Markdown Docs", accentTone: .neutral)
            }

            JoyCard(title: "Cross-Repo Asset Studio Binding Index (v_asset_studio_entries)", badge: "SQLite View", badgeTone: .gold, strongBorder: true) {
                let assetRes = store.runSqliteQuery("SELECT * FROM v_asset_studio_entries;")
                sqlTableView(assetRes)
            }
        }
    }

    private var jobsSection: some View {
        let filtered = store.jobs.filter { matches("\($0.id) \($0.name) \($0.assetStudioKey) \($0.allowedWeaponKinds.joined(separator: " "))") }
        return VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            Text("Job Class Hierarchy & Promotion Trials (\(filtered.count))")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: JoyDesign.Space.s3)], spacing: JoyDesign.Space.s3) {
                ForEach(filtered) { job in
                    JoyCard(
                        title: "\(job.name) (\(job.id))",
                        badge: "Tier \(job.tier)",
                        badgeTone: job.tier == 2 ? .gold : (job.tier == 1 ? .info : .neutral),
                        strongBorder: job.tier == 2
                    ) {
                        VStack(alignment: .leading, spacing: JoyDesign.Space.s1) {
                            Text("Parent: \(job.parentJobId ?? "Root") · Min Base Lv.\(job.minBaseLevel) · Max Job Lv.\(job.maxJobLevel)")
                                .font(JoyDesign.Typography.caption)
                                .foregroundColor(JoyDesign.Colors.textSecondary)
                            Text("Weapons: \(job.allowedWeaponKinds.joined(separator: ", "))")
                                .font(JoyDesign.Typography.mono)
                                .foregroundColor(JoyDesign.Colors.textPrimary)
                            Text("Skills: \(job.unlockedSkillIds.joined(separator: ", "))")
                                .font(JoyDesign.Typography.mono)
                                .foregroundColor(JoyDesign.Colors.success)
                            Text("Asset Key: \(job.assetStudioKey)")
                                .font(JoyDesign.Typography.mono)
                                .foregroundColor(JoyDesign.Colors.secondaryHover)
                        }
                    }
                }
            }
        }
    }

    private var mobsSection: some View {
        let filtered = store.mobs.filter { matches("\($0.id) \($0.name) \($0.element) \($0.race) \($0.size)") }
        return VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            Text("Monster Bestiary, Drop Tables & EXP/HP Efficiency (\(filtered.count))")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: JoyDesign.Space.s3)], spacing: JoyDesign.Space.s3) {
                ForEach(filtered) { mob in
                    JoyCard(
                        title: "Lv.\(mob.level) \(mob.name)",
                        badge: mob.isMvp ? "★ MVP BOSS" : mob.rank.uppercased(),
                        badgeTone: mob.isMvp ? .gold : .bronze,
                        strongBorder: mob.isMvp
                    ) {
                        VStack(alignment: .leading, spacing: JoyDesign.Space.s1) {
                            HStack(spacing: JoyDesign.Space.s1) {
                                JoyBadge(mob.element, tone: .info)
                                JoyBadge(mob.race, tone: .bronze)
                                JoyBadge(mob.size, tone: .neutral)
                            }
                            Text("HP \(mob.hp) · ATK \(mob.pAtk) · DEF \(mob.pDef)")
                                .font(JoyDesign.Typography.mono)
                            Text("EXP: +\(mob.baseExp) Base / +\(mob.jobExp) Job · Card: \(mob.cardId ?? "—")")
                                .font(JoyDesign.Typography.mono)
                                .foregroundColor(JoyDesign.Colors.success)
                            Text("Drops: " + mob.drops.map { "\($0.itemId) (\(Double($0.chanceBps)/100.0)%)" }.joined(separator: ", "))
                                .font(JoyDesign.Typography.caption)
                                .foregroundColor(JoyDesign.Colors.textSecondary)
                        }
                    }
                }
            }
        }
    }

    private var elementsSection: some View {
        let elems = store.elements.elements
        return VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            JoyCard(title: "10-Element Counter Matrix (Attacker Row vs. Defender Column %)", badge: "10×10", badgeTone: .gold, strongBorder: true) {
                ScrollView(.horizontal) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text("ATK \\ DEF")
                                .font(JoyDesign.Typography.monoBold)
                                .foregroundColor(JoyDesign.Colors.primary)
                                .frame(width: 88, alignment: .leading)
                            ForEach(elems, id: \.self) { e in
                                Text(e)
                                    .font(JoyDesign.Typography.monoBold)
                                    .foregroundColor(JoyDesign.Colors.primary)
                                    .frame(width: 68, alignment: .center)
                            }
                        }
                        Rectangle().fill(JoyDesign.Colors.border).frame(height: 1)
                        ForEach(elems, id: \.self) { atk in
                            HStack(spacing: 4) {
                                Text(atk)
                                    .font(JoyDesign.Typography.monoBold)
                                    .foregroundColor(JoyDesign.Colors.textPrimary)
                                    .frame(width: 88, alignment: .leading)
                                ForEach(elems, id: \.self) { def in
                                    let val = store.elements.damageMatrixPct[atk]?[def] ?? 100
                                    Text("\(val)%")
                                        .font(val == 100 ? JoyDesign.Typography.mono : JoyDesign.Typography.monoBold)
                                        .foregroundColor(
                                            val > 100
                                                ? JoyDesign.Colors.success
                                                : (val < 100 ? JoyDesign.Colors.danger : JoyDesign.Colors.textSecondary)
                                        )
                                        .frame(width: 68, alignment: .center)
                                }
                            }
                        }
                    }
                    .padding(JoyDesign.Space.s2)
                }
            }

            JoyCard(title: "Weapon Kind vs. Monster Size Modifier (Small / Medium / Large %)", badge: "Size Table", badgeTone: .bronze) {
                VStack(alignment: .leading, spacing: JoyDesign.Space.s2) {
                    ForEach(store.elements.weaponSizePenaltyPct.keys.sorted(), id: \.self) { wpn in
                        let row = store.elements.weaponSizePenaltyPct[wpn] ?? [:]
                        HStack(spacing: 24) {
                            Text(wpn)
                                .font(JoyDesign.Typography.monoBold)
                                .foregroundColor(JoyDesign.Colors.primary)
                                .frame(width: 140, alignment: .leading)
                            Text("Small: \(row["Small"] ?? 100)%")
                                .font(JoyDesign.Typography.mono)
                            Text("Medium: \(row["Medium"] ?? 100)%")
                                .font(JoyDesign.Typography.mono)
                            Text("Large: \(row["Large"] ?? 100)%")
                                .font(JoyDesign.Typography.mono)
                        }
                    }
                }
            }
        }
    }

    private var cardsSection: some View {
        let filteredCards = store.cards.filter { matches("\($0.id) \($0.name) \($0.slot) \($0.mobId)") }
        return VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            Text("Monster Cards (\(filteredCards.count))")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: JoyDesign.Space.s3)], spacing: JoyDesign.Space.s3) {
                ForEach(filteredCards) { card in
                    JoyCard(title: card.name, badge: card.slot.uppercased(), badgeTone: .gold) {
                        VStack(alignment: .leading, spacing: JoyDesign.Space.s1) {
                            Text("Equip Bonus: \(card.equipStats.map { "\($0.key) +\($0.value)" }.joined(separator: ", "))")
                                .font(JoyDesign.Typography.mono)
                            Text("Handbook Deposit: \(card.handbookDepositStats.map { "\($0.key) +\($0.value)" }.joined(separator: ", "))")
                                .font(JoyDesign.Typography.mono)
                                .foregroundColor(JoyDesign.Colors.success)
                        }
                    }
                }
            }

            Text("Adventurer Handbook Milestones (\(store.handbook.count))")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            ForEach(store.handbook) { h in
                JoyCard(title: h.title, badge: h.category.uppercased(), badgeTone: .bronze) {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(h.tiers.enumerated()), id: \.offset) { _, tier in
                            Text("• ≥ \(tier.requiredCount): \(tier.unlockNote) → \(tier.bonusStat) +\(tier.bonusValue)")
                                .font(JoyDesign.Typography.mono)
                                .foregroundColor(JoyDesign.Colors.success)
                        }
                    }
                }
            }
        }
    }

    private var questsSection: some View {
        let filtered = store.quests.filter { matches("\($0.id) \($0.title) \($0.category) \($0.zoneId)") }
        return VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            Text("Unified 6-Category Quest Board (\(filtered.count))")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: JoyDesign.Space.s3)], spacing: JoyDesign.Space.s3) {
                ForEach(filtered) { q in
                    JoyCard(title: q.title, badge: q.category.uppercased(), badgeTone: q.rewards.unlockJobId != nil ? .gold : .info) {
                        VStack(alignment: .leading, spacing: JoyDesign.Space.s1) {
                            Text("ID: \(q.id) · Zone: \(q.zoneId) · Min Base Lv.\(q.minBaseLevel)")
                                .font(JoyDesign.Typography.caption)
                                .foregroundColor(JoyDesign.Colors.textSecondary)
                            Text("Rewards: +\(q.rewards.baseXp) Base EXP / +\(q.rewards.jobXp) Job EXP")
                                .font(JoyDesign.Typography.mono)
                            if let jobUnlock = q.rewards.unlockJobId {
                                Text("Unlocks Job Class: \(jobUnlock)")
                                    .font(JoyDesign.Typography.monoBold)
                                    .foregroundColor(JoyDesign.Colors.primary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var siegeSection: some View {
        let castle = store.castles.first
        let scale = Double(castle?.pvpRules.playerDamageScalingPct ?? 60) / 100.0
        let raidDps = max(1.0, siegeAttackers * siegeDps * scale)
        let barricadeHp = Double(((castle?.fortifications.outerGateBarricadeCount ?? 2) + (castle?.fortifications.innerGateBarricadeCount ?? 2)) * (castle?.fortifications.barricadeHp ?? 45000))
        let empHp = Double(castle?.emperium.hp ?? 120000)
        let barSec = barricadeHp / raidDps
        let empSec = empHp / raidDps
        let totalMin = (barSec + empSec + 45.0) / 60.0

        return VStack(alignment: .leading, spacing: JoyDesign.Space.s4) {
            Text("War of Emperium (GvG Castle Siege) — Breach & TTK Calculator")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            JoyCard(title: "Interactive Raid Breach Simulator", badge: "WoE Sim", badgeTone: .gold, strongBorder: true) {
                VStack(alignment: .leading, spacing: JoyDesign.Space.s3) {
                    HStack {
                        Text("Attackers: \(Int(siegeAttackers))")
                            .font(JoyDesign.Typography.monoBold)
                            .frame(width: 150, alignment: .leading)
                        Slider(value: $siegeAttackers, in: 1...50, step: 1)
                            .tint(JoyDesign.Colors.primary)
                    }
                    HStack {
                        Text("Normal DPS/Player: \(Int(siegeDps))")
                            .font(JoyDesign.Typography.monoBold)
                            .frame(width: 150, alignment: .leading)
                        Slider(value: $siegeDps, in: 100...3000, step: 50)
                            .tint(JoyDesign.Colors.primary)
                    }
                    JoyWell {
                        Text(String(format: "4 Barricades (180k HP): %.1fs  |  Holy Emperium (120k HP, Normal Attack Only): %.1fs  |  Total Siege Breach: %.2f min", barSec, empSec, totalMin))
                            .font(JoyDesign.Typography.monoBold)
                            .foregroundColor(JoyDesign.Colors.primary)
                    }
                }
            }

            ForEach(store.castles) { cs in
                JoyCard(title: "\(cs.name) (\(cs.id))", badge: "GvG Castle", badgeTone: .bronze) {
                    VStack(alignment: .leading, spacing: JoyDesign.Space.s1) {
                        Text("Hub Town: \(cs.hubTownId) · Siege Map: \(cs.siegeMapId) · Duration: \(cs.siegeDurationMinutes)m")
                            .font(JoyDesign.Typography.mono)
                        Text("Emperium: \(cs.emperium.hp) HP (\(cs.emperium.element)/\(cs.emperium.race)/\(cs.emperium.size)) · onlyNormalAttackDamage=\(String(cs.emperium.onlyNormalAttackDamage))")
                            .font(JoyDesign.Typography.mono)
                        Text("Rewards: \(cs.ownerRewards.dailyTreasureChestCount) Daily Chests · Guild Dungeon: \(cs.ownerRewards.guildDungeonZoneId)")
                            .font(JoyDesign.Typography.mono)
                            .foregroundColor(JoyDesign.Colors.success)
                    }
                }
            }
        }
    }

    private var sqlSection: some View {
        VStack(alignment: .leading, spacing: JoyDesign.Space.s3) {
            Text("Live Read-Only SQLite Query Studio (build/catalog.sqlite)")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            HStack(spacing: JoyDesign.Space.s2) {
                Button("v_job_progression") { runPreset("SELECT * FROM v_job_progression;") }
                    .buttonStyle(JoyGhostButtonStyle())
                Button("v_mob_economy") { runPreset("SELECT * FROM v_mob_economy;") }
                    .buttonStyle(JoyGhostButtonStyle())
                Button("v_asset_studio_entries") { runPreset("SELECT * FROM v_asset_studio_entries;") }
                    .buttonStyle(JoyGhostButtonStyle())
                Button("Mob Drops") {
                    runPreset("SELECT m.name AS mob, i.name AS item, d.chance_bps/100.0 AS drop_pct FROM mob_drops d JOIN mobs m ON m.id=d.mob_id JOIN items i ON i.id=d.item_id ORDER BY m.level;")
                }
                .buttonStyle(JoyGhostButtonStyle())
                Button("Quest Board") {
                    runPreset("SELECT id, title, category, min_base_level, base_xp, job_xp, unlock_job_id FROM quest_board ORDER BY min_base_level;")
                }
                .buttonStyle(JoyGhostButtonStyle())
            }

            JoyWell {
                TextEditor(text: $sqlText)
                    .font(JoyDesign.Typography.mono)
                    .scrollContentBackground(.hidden)
                    .foregroundColor(JoyDesign.Colors.textPrimary)
                    .frame(height: 84)
            }

            Button("▶ Execute Read-Only SQL") {
                sqlResult = store.runSqliteQuery(sqlText)
            }
            .buttonStyle(JoyPrimaryButtonStyle())

            JoyCard(title: "Query Results (\(sqlResult.rows.count) rows)", badge: "Read-Only", badgeTone: .info) {
                sqlTableView(sqlResult)
            }
        }
    }

    private func runPreset(_ q: String) {
        sqlText = q
        sqlResult = store.runSqliteQuery(q)
    }

    @ViewBuilder
    private func sqlTableView(_ res: SqlQueryResult) -> some View {
        if let err = res.error {
            Text("SQL Error: \(err)")
                .foregroundColor(JoyDesign.Colors.danger)
                .font(JoyDesign.Typography.monoBold)
        } else {
            ScrollView(.horizontal) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 12) {
                        ForEach(res.columns, id: \.self) { col in
                            Text(col)
                                .font(JoyDesign.Typography.monoBold)
                                .foregroundColor(JoyDesign.Colors.primary)
                                .frame(width: 150, alignment: .leading)
                        }
                    }
                    Rectangle().fill(JoyDesign.Colors.border).frame(height: 1)
                    ForEach(Array(res.rows.enumerated()), id: \.offset) { _, row in
                        HStack(spacing: 12) {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                Text(cell)
                                    .font(JoyDesign.Typography.mono)
                                    .foregroundColor(JoyDesign.Colors.textPrimary)
                                    .frame(width: 150, alignment: .leading)
                            }
                        }
                        Rectangle().fill(JoyDesign.Colors.border.opacity(0.35)).frame(height: 1)
                    }
                }
                .padding(JoyDesign.Space.s2)
            }
        }
    }

    private var simSection: some View {
        VStack(alignment: .leading, spacing: JoyDesign.Space.s3) {
            HStack {
                Text("Headless server-rs Balance Simulator Output (`balance_sim`)")
                    .font(JoyDesign.Typography.h1)
                    .foregroundColor(JoyDesign.Colors.primary)
                Spacer()
                Button("▶ Re-Run Simulator") {
                    store.runBalanceSim()
                }
                .buttonStyle(JoyPrimaryButtonStyle())
            }
            JoyWell {
                Text(store.balanceSimOutput)
                    .font(JoyDesign.Typography.mono)
                    .foregroundColor(JoyDesign.Colors.textPrimary)
                    .textSelection(.enabled)
            }
        }
    }

    private var docsSection: some View {
        let activeDoc = store.docs.first(where: { $0.id == selectedDocId }) ?? store.docs.first
        return VStack(alignment: .leading, spacing: JoyDesign.Space.s3) {
            Text("Architecture Specs & World Lore Canon Reviewer")
                .font(JoyDesign.Typography.h1)
                .foregroundColor(JoyDesign.Colors.primary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: JoyDesign.Space.s2) {
                    ForEach(store.docs) { doc in
                        Button(doc.id) {
                            selectedDocId = doc.id
                        }
                        .buttonStyle(JoyGhostButtonStyle(isActive: selectedDocId == doc.id))
                    }
                }
            }

            if let doc = activeDoc {
                JoyBadge(doc.relativePath, tone: .bronze)
                JoyWell {
                    Text(doc.content)
                        .font(JoyDesign.Typography.mono)
                        .foregroundColor(JoyDesign.Colors.textPrimary)
                        .textSelection(.enabled)
                }
            }
        }
    }
}

@main
struct AtlasObservatoryMain {
    static func main() {
        if CommandLine.arguments.contains("--self-test") {
            let store = ObservatoryStore()
            let res = store.runSqliteQuery("SELECT * FROM v_mob_economy;")
            let designTokensOk = JoyDesign.Space.s4 == 16 && JoyDesign.Radius.r2 == 10
            print("[AtlasObservatory.app] SELF-TEST PASS — JoyDesign=\(designTokensOk), jobs=\(store.jobs.count), mobs=\(store.mobs.count), cards=\(store.cards.count), quests=\(store.quests.count), castles=\(store.castles.count), sql_rows=\(res.rows.count)")
            exit(res.error == nil && !store.jobs.isEmpty && designTokensOk ? 0 : 1)
        }

        let app = NSApplication.shared
        app.setActivationPolicy(.regular)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Atlas World — MMORPG Catalog, SQLite & Balance Observatory (JoyDesign Swift)"
        window.appearance = NSAppearance(named: .darkAqua)
        window.contentView = NSHostingView(rootView: MainObservatoryView())
        window.makeKeyAndOrderFront(nil)
        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
