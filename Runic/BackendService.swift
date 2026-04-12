//
//  BackendService.swift
//  BISV26
//
//  Backend API client — auth, chat proxy, tasks
//

import Foundation
import os.log

private let logger = Logger(subsystem: "com.runic.agent", category: "BackendService")

@Observable
@MainActor
final class BackendService {
    // MARK: - Singleton
    static let shared = BackendService()
    
    // MARK: - State

    var isLoggedIn: Bool { token != nil }
    var username: String = ""
    var userId: String = ""
    var errorMessage: String?

    private(set) var token: String? {
        didSet { persistToken() }
    }

    #if DEBUG
    let baseURL: String = "http://10.0.0.106:8000"
    #else
    let baseURL: String = "https://Runic.gozelski.com"
    #endif

    // MARK: - Subscription State
    var hasSubscription: Bool = false
    var subscriptionExpiryDate: Date? = nil

    static let subscriptionKey = "subscription_has_active"
    static let subscriptionExpiryKey = "subscription_expiry_date"

    // MARK: - Init

    init() {
        // Restore saved session
        token = UserDefaults.standard.string(forKey: "backend_token")
        username = UserDefaults.standard.string(forKey: "backend_username") ?? ""
        userId = UserDefaults.standard.string(forKey: "backend_user_id") ?? ""
    }

    // MARK: - Auth

    func register(username: String, password: String) async throws {
        let body: [String: Any] = ["username": username, "password": password]
        let data = try await post(path: "/api/auth/register", body: body, auth: false)
        try handleAuthResponse(data)
    }

    func login(username: String, password: String) async throws {
        let body: [String: Any] = ["username": username, "password": password]
        let data = try await post(path: "/api/auth/login", body: body, auth: false)
        try handleAuthResponse(data)
    }

    func logout() {
        token = nil
        username = ""
        userId = ""
        UserDefaults.standard.removeObject(forKey: "backend_username")
        UserDefaults.standard.removeObject(forKey: "backend_user_id")
        logger.info("Logged out")
    }

    func fetchCurrentUser() async throws {
        let data = try await get(path: "/api/auth/me")
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let uid = json["user_id"] as? String,
              let uname = json["username"] as? String else {
            throw BackendError.invalidResponse
        }
        userId = uid
        username = uname
    }

    // MARK: - Subscription
    struct SubscriptionStatus: Codable {
        let hasSubscription: Bool
        let subscriptionExpiry: Date?
        let plan: String?
        let status: String?
    }

    func fetchSubscriptionStatus() async throws -> SubscriptionStatus {
        let data = try await get(path: "/api/subscription")
        return try JSONDecoder().decode(SubscriptionStatus.self, from: data)
    }

    func syncSubscriptionStatus() {
        if hasSubscription {
            UserDefaults.standard.set(true, forKey: BackendService.subscriptionKey)
        } else {
            UserDefaults.standard.set(false, forKey: BackendService.subscriptionKey)
        }
        if let expiry = subscriptionExpiryDate {
            UserDefaults.standard.set(expiry.timeIntervalSince1970, forKey: BackendService.subscriptionExpiryKey)
        }
    }

    static func loadSubscriptionStatus() -> Bool {
        guard let expiryTime = UserDefaults.standard.object(forKey: subscriptionExpiryKey) as? Double else {
            return false
        }
        if expiryTime < Date().timeIntervalSince1970 {
            UserDefaults.standard.set(false, forKey: subscriptionKey)
            return false
        }
        guard let hasSub = UserDefaults.standard.object(forKey: subscriptionKey) as? Bool else {
            return false
        }
        return hasSub
    }

    // MARK: - HTTP Helpers

    private func get(path: String) async throws -> Data {
        let url = URL(string: baseURL + path)!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 120
        addAuth(to: &request)
        request.addValue("application/json", forHTTPHeaderField: "Accept")

        logger.debug("GET \(path)")
        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response, data: data, path: path)
        return data
    }

    func post(path: String, body: [String: Any], auth: Bool) async throws -> Data {
        let url = URL(string: baseURL + path)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120
        if auth { addAuth(to: &request) }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        logger.debug("POST \(path) (\(request.httpBody?.count ?? 0) bytes)")
        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response, data: data, path: path)
        return data
    }

    private func addAuth(to request: inout URLRequest) {
        if let token = token {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func validateResponse(_ response: URLResponse, data: Data, path: String) throws {
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.invalidResponse
        }
        logger.debug("\(path) → HTTP \(http.statusCode) (\(data.count) bytes)")
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            logger.error("\(path) error \(http.statusCode): \(body)")
            // If 401, token is stale
            if http.statusCode == 401 {
                token = nil
            }
            throw BackendError.apiError(statusCode: http.statusCode, message: body)
        }
    }

    private func handleAuthResponse(_ data: Data) throws {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let t = json["token"] as? String,
              let uid = json["user_id"] as? String,
              let uname = json["username"] as? String else {
            throw BackendError.invalidResponse
        }
        token = t
        userId = uid
        username = uname
        UserDefaults.standard.set(uname, forKey: "backend_username")
        UserDefaults.standard.set(uid, forKey: "backend_user_id")
        logger.info("Authenticated as \(uname)")
    }

    private func persistToken() {
        if let token = token {
            UserDefaults.standard.set(token, forKey: "backend_token")
        } else {
            UserDefaults.standard.removeObject(forKey: "backend_token")
        }
    }

    // MARK: - Errors

    enum BackendError: LocalizedError {
        case invalidResponse
        case apiError(statusCode: Int, message: String)
        case notLoggedIn

        var errorDescription: String? {
            switch self {
            case .invalidResponse: return "Invalid response from server"
            case .apiError(let code, let msg): return "Server error (\(code)): \(msg)"
            case .notLoggedIn: return "Not logged in"
            }
        }
    }
}
