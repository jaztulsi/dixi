//
//  SettingsView.swift
//  Runic
//
//  Settings and subscription management UI
//

import SwiftUI
import StoreKit

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var storeManager = StoreManager.shared
    @State private var isLoading = false
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if BackendService.shared.isLoggedIn {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Account")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                            Text("Username: \(BackendService.shared.username.isEmpty ? "Unknown" : BackendService.shared.username)")
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                            
                            Button("Sign Out") {
                                BackendService.shared.logout()
                            }
                            .buttonStyle(.bordered)
                            .tint(.red)
                        }
                        .padding(.vertical, 12)
                    } else {
                        Button("Sign In / Register") {
                            dismiss()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                
                Section {
                    //TODO: remove in favor of purchase screen.
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Runic Pro Subscription")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        
                        if storeManager.isPremium {
                            HStack(spacing: 8) {
                                Image(systemName: "star.fill")
                                    .foregroundStyle(.yellow)
                                Text("Premium Active")
                                    .foregroundStyle(.green)
                            }
                            .font(.subheadline)
                        } else {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Upgrade to Premium to unlock:")
                                    .font(.subheadline)
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Label("Unlimited AI interactions", systemImage: "checkmark")
                                    Label("Priority processing", systemImage: "checkmark")
                                    Label("Advanced automation", systemImage: "checkmark")
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                            
                            if storeManager.isProcessing {
                                ProgressView()
                                    .padding(.top, 8)
                            } else {
                                ForEach(storeManager.products, id: \.id) { product in
                                    Button {
                                        Task {
                                            await subscribe(to: product)
                                        }
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading) {
                                                Text(product.displayName)
                                                    .font(.subheadline)
                                                Text(product.displayPrice)
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                            Spacer()
                                            if storeManager.isProcessing {
                                                ProgressView()
                                            }
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .padding(.top, 4)
                                }
                            }
                            
                            if let error = errorMessage {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .padding(.top, 4)
                            }
                        }
                    }
                    .padding(.vertical, 12)
                }
                
                Section {
                    Button("Restore Purchases") {
                        Task {
                            isLoading = true
                            do {
                                try await storeManager.restorePurchases()
                            } catch {
                                errorMessage = error.localizedDescription
                            }
                            isLoading = false
                        }
                    }
                    .disabled(isLoading)
                }
                
                Section {
                    NavigationLink("About") {
                        AboutView()
                    }
                }
                
                Section {
                    Text("Version 1.0.0")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                } footer: {
                    Text("Built for iOS 17+ and macOS 14+")
                }
            }
            .navigationTitle("Settings")
            .formStyle(.grouped)
            .onAppear {
                Task {
                    await storeManager.loadProducts()
                    await storeManager.updateSubscriptionStatus()
                }
            }
        }
    }
    
    private func subscribe(to product: Product) async {
        isLoading = true
        errorMessage = nil
        
        do {
            try await storeManager.purchase(product)
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
}

private struct AboutView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Runic")
                        .font(.title)
                        .fontWeight(.semibold)
                    
                    Text("An intelligent browser assistant powered by AI")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                    Divider()
                    
                    LabeledContent("Version") {
                        Text("1.0.0")
                    }
                    
                    LabeledContent("Build") {
                        Text("2024")
                    }
                }
            }
            .navigationTitle("About")
        }
    }
}

#Preview {
    SettingsView()
}
