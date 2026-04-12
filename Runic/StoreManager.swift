//
//  StoreManager.swift
//  Runic
//
//  StoreKit 2.x implementation for subscriptions
//

import StoreKit
import Foundation

@Observable
@MainActor
final class StoreManager {
    static let shared = StoreManager()
    
    // MARK: - Product IDs
    enum ProductID {
        static let monthly = "com.Runic.monthlyPremium"
        static let yearly = "com.Runic.yearlyPremium"
        
        static var all: [String] { [monthly, yearly] }
    }
    
    // MARK: - State
    var products: [Product] = []
    var isPremium: Bool = false
    var isProcessing: Bool = false
    var errorMessage: String?
    var showSubscriptionSheet: Bool = false
    
    // MARK: - Private
    private var transactionListener: Task<Void, Never>?
    
    private init() {
        startTransactionListener()
        Task {
            await loadProducts()
            await updateSubscriptionStatus()
        }
    }
    
    // MARK: - Transaction Listener
    private func startTransactionListener() {
        transactionListener = Task { @MainActor [weak self] in
            for await result in Transaction.updates {
                await self?.handleTransaction(result)
            }
        }
    }
    
    @MainActor
    private func handleTransaction(_ result: VerificationResult<Transaction>) async {
        switch result {
        case .unverified:
            break
            
        case .verified(let transaction):
            await processTransaction(transaction)
            await transaction.finish()
        }
    }
    
    @MainActor
    private func processTransaction(_ transaction: Transaction) async {
        if transaction.productType == .autoRenewable && transaction.revocationDate == nil {
            isPremium = true
        }
        
        await syncTransactionWithBackend(transaction)
    }
    
    // MARK: - Backend Sync
    @MainActor
    private func syncTransactionWithBackend(_ transaction: Transaction) async {
        guard BackendService.shared.token != nil else {
            return
        }
        
        let payload = TransactionPayload(
            transactionId: String(transaction.id),
            originalTransactionId: String(transaction.originalID),
            productId: transaction.productID,
            purchaseDate: transaction.purchaseDate,
            expirationDate: transaction.expirationDate,
            revocationDate: transaction.revocationDate,
            webOrderLineItemId: transaction.webOrderLineItemID.map { String($0) }
        )
        
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let body = try encoder.encode(payload)
            
            guard let url = URL(string: BackendService.shared.baseURL + "/api/subscription/verify") else {
                return
            }
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(BackendService.shared.token ?? "")", forHTTPHeaderField: "Authorization")
            request.httpBody = body
            request.timeoutInterval = 30
            
            let (data, _) = try await URLSession.shared.data(for: request)
            
            if let result = try? JSONDecoder().decode(SyncResponse.self, from: data) {
                self.isPremium = result.hasSubscription
            }
        } catch {
            print("Backend sync failed: \(error)")
        }
    }
    
    // MARK: - Public API
    func loadProducts() async {
        do {
            products = try await Product.products(for: ProductID.all)
        } catch {
            errorMessage = "Failed to load products"
        }
    }
    
    func updateSubscriptionStatus() async {
        var hasActive = false
        
        for await result in Transaction.currentEntitlements {
            if case .verified(let entitlement) = result,
               entitlement.productType == .autoRenewable,
               entitlement.revocationDate == nil {
                hasActive = true
            }
        }
        
        isPremium = hasActive
    }
    
    func purchase(_ product: Product) async throws {
        isProcessing = true
        errorMessage = nil
        
        defer { Task { @MainActor in self.isProcessing = false } }
        
        let result = try await product.purchase()
        
        switch result {
        case .success(let verification):
            await handleTransaction(verification)
            
        case .userCancelled:
            throw StoreError.userCancelled
            
        case .pending:
            throw StoreError.pending
            
        default:
            throw StoreError.unknown
        }
    }
    
    func purchaseMonthly() async throws {
        guard let product = products.first(where: { $0.id == ProductID.monthly }) else {
            throw StoreError.productNotFound
        }
        try await purchase(product)
    }
    
    func purchaseYearly() async throws {
        guard let product = products.first(where: { $0.id == ProductID.yearly }) else {
            throw StoreError.productNotFound
        }
        try await purchase(product)
    }
    
    func restorePurchases() async throws {
        isProcessing = true
        defer { Task { @MainActor in self.isProcessing = false } }
        
        await updateSubscriptionStatus()
        
        if !isPremium, BackendService.shared.token != nil {
            let url = URL(string: BackendService.shared.baseURL + "/api/subscription/restore")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(BackendService.shared.token ?? "")", forHTTPHeaderField: "Authorization")
            
            let (_, response) = try await URLSession.shared.data(for: request)
            
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                await updateSubscriptionStatus()
            }
        }
    }
    
    // MARK: - Errors
    enum StoreError: LocalizedError {
        case userCancelled
        case pending
        case purchaseFailed(String)
        case productNotFound
        case unknown
        
        var errorDescription: String? {
            switch self {
            case .userCancelled: return "Purchase was cancelled"
            case .pending: return "Purchase is pending"
            case .purchaseFailed(let msg): return "Purchase failed: \(msg)"
            case .productNotFound: return "Product not available"
            case .unknown: return "Unknown error"
            }
        }
    }
}

// MARK: - API Payloads

struct TransactionPayload: Codable {
    let transactionId: String
    let originalTransactionId: String
    let productId: String
    let purchaseDate: Date
    let expirationDate: Date?
    let revocationDate: Date?
    let webOrderLineItemId: String?
}

struct SyncResponse: Codable {
    let hasSubscription: Bool
    let subscriptionExpiry: Date?
    let message: String?
}
