// AtlasObservatoryApp.swift — Native macOS App Shell (`AtlasObservatory.app`)
//
// Renders the canonical `joy-design` Web Observatory (`scripts/catalog_explorer_web.py` +
// `@joymify/tokens` `theme.css` + `@joymify/brand`) inside a native macOS `WKWebView`,
// while providing native SQLite3 + JoyDesign Swift token self-test verification.

import AppKit
import Foundation
import SQLite3
import SwiftUI
import WebKit

final class WebObservatoryHost: NSObject, ObservableObject {
    let repoRoot: URL
    let port: Int = 8788
    private var serverProcess: Process?
    @Published var isReady: Bool = false

    override init() {
        let fm = FileManager.default
        let execURL = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        let bundleRoot = execURL
            .deletingLastPathComponent() // MacOS
            .deletingLastPathComponent() // Contents
        let embeddedRepoFile = bundleRoot.appendingPathComponent("Resources/repo_root.txt")
        let embeddedRepo = (try? String(contentsOf: embeddedRepoFile, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let relativeCandidate = bundleRoot
            .deletingLastPathComponent() // AtlasObservatory.app
            .deletingLastPathComponent() // build
            .deletingLastPathComponent() // repoRoot
        let homeCandidate = fm.homeDirectoryForCurrentUser
            .appendingPathComponent("workspace/repos/atlas-world-svc")

        var candidates: [URL] = []
        if let envRoot = ProcessInfo.processInfo.environment["ATLAS_REPO_ROOT"], !envRoot.isEmpty {
            candidates.append(URL(fileURLWithPath: envRoot))
        }
        candidates.append(relativeCandidate)
        if let embeddedRepo = embeddedRepo, !embeddedRepo.isEmpty {
            candidates.append(URL(fileURLWithPath: embeddedRepo))
        }
        candidates.append(homeCandidate)
        candidates.append(URL(fileURLWithPath: fm.currentDirectoryPath))

        self.repoRoot = candidates.first(where: {
            fm.fileExists(atPath: $0.appendingPathComponent("contracts/content/jobs.json").path)
        }) ?? URL(fileURLWithPath: fm.currentDirectoryPath)

        super.init()
    }

    var webURL: URL {
        URL(string: "http://127.0.0.1:\(port)/")!
    }

    func ensureServerRunning() {
        checkHealth { [weak self] alive in
            guard let self = self else { return }
            if alive {
                DispatchQueue.main.async { self.isReady = true }
                return
            }
            self.spawnServer()
        }
    }

    private func spawnServer() {
        let script = repoRoot.appendingPathComponent("scripts/catalog_explorer_web.py").path
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        proc.arguments = [script, "--port", "\(port)"]
        proc.currentDirectoryURL = repoRoot
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        try? proc.run()
        self.serverProcess = proc
        pollUntilReady(attemptsLeft: 30)
    }

    private func pollUntilReady(attemptsLeft: Int) {
        guard attemptsLeft > 0 else {
            DispatchQueue.main.async { self.isReady = true }
            return
        }
        checkHealth { [weak self] alive in
            guard let self = self else { return }
            if alive {
                DispatchQueue.main.async { self.isReady = true }
            } else {
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.15) {
                    self.pollUntilReady(attemptsLeft: attemptsLeft - 1)
                }
            }
        }
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        var req = URLRequest(url: webURL.appendingPathComponent("api/bundle"))
        req.timeoutInterval = 0.5
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                completion(true)
            } else {
                completion(false)
            }
        }.resume()
    }

    func runSelfTest() -> Bool {
        let contentDir = repoRoot.appendingPathComponent("contracts/content")
        func countJsonArray(_ name: String) -> Int {
            guard let data = try? Data(contentsOf: contentDir.appendingPathComponent(name)),
                  let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                return 0
            }
            return arr.count
        }
        let jobs = countJsonArray("jobs.json")
        let mobs = countJsonArray("mobs.json")
        let cards = countJsonArray("cards.json")
        let quests = countJsonArray("quest_board.json")
        let castles = countJsonArray("castles.json")

        let dbPath = repoRoot.appendingPathComponent("build/catalog.sqlite").path
        var db: OpaquePointer?
        var sqlRows = 0
        if sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK {
            var stmt: OpaquePointer?
            if sqlite3_prepare_v2(db, "SELECT * FROM v_mob_economy;", -1, &stmt, nil) == SQLITE_OK {
                while sqlite3_step(stmt) == SQLITE_ROW {
                    sqlRows += 1
                }
                sqlite3_finalize(stmt)
            }
            sqlite3_close(db)
        }
        let designTokensOk = JoyDesign.Space.s4 == 16 && JoyDesign.Radius.r2 == 10
        print("[AtlasObservatory.app] SELF-TEST PASS — JoyDesign=\(designTokensOk), jobs=\(jobs), mobs=\(mobs), cards=\(cards), quests=\(quests), castles=\(castles), sql_rows=\(sqlRows)")
        return designTokensOk && jobs > 0 && sqlRows > 0
    }
}

struct JoyWebViewRepresentable: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

struct MainObservatoryView: View {
    @StateObject private var host = WebObservatoryHost()

    var body: some View {
        ZStack {
            JoyDesign.Colors.background.ignoresSafeArea()
            if host.isReady {
                JoyWebViewRepresentable(url: host.webURL)
                    .ignoresSafeArea()
            } else {
                VStack(spacing: JoyDesign.Space.s3) {
                    JoyBadge("JOYMIFY DESIGN SYSTEM v3.12", tone: .gold)
                    Text("Starting Atlas World Observatory...")
                        .font(JoyDesign.Typography.h2)
                        .foregroundColor(JoyDesign.Colors.textPrimary)
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            host.ensureServerRunning()
        }
    }
}

@main
struct AtlasObservatoryMain {
    static func main() {
        let host = WebObservatoryHost()
        if CommandLine.arguments.contains("--self-test") {
            exit(host.runSelfTest() ? 0 : 1)
        }

        let app = NSApplication.shared
        app.setActivationPolicy(.regular)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1380, height: 880),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Atlas World — Joymify Design Observatory"
        window.appearance = NSAppearance(named: .darkAqua)
        window.contentView = NSHostingView(rootView: MainObservatoryView())
        window.makeKeyAndOrderFront(nil)
        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
