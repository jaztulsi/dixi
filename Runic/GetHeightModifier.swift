//
//  GetHeightModifier.swift
//  BISV26
//
//  Created by Zack Gozelski on 3/8/26.
//


import SwiftUI

struct GetHeightModifier: ViewModifier {
    @Binding var height: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geo -> Color in
                    // Use DispatchQueue.main.async to avoid modifying state during a view update
                    DispatchQueue.main.async {
                        height = geo.size.height
                    }
                    return Color.clear // Return an invisible view
                }
            )
    }
}


extension View {
    func bindHeight(to heightBinding: Binding<CGFloat>) -> some View {
        self.modifier(GetHeightModifier(height: heightBinding))
    }
}
