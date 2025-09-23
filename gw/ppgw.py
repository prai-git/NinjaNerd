#!/usr/bin/env python3
"""
PayPal Standard Checkout Gateway - Modern Orders API v2 Only
Core functionality for receiving payments via PayPal REST API for NinjaNerd

PAYMENT FLOW:
1. Frontend: User clicks PayPal button → createOrder() → AJAX call to /create-order
2. Backend: create_order() → returns order_id to frontend
3. Frontend: PayPal popup opens → user approves → onApprove() → AJAX call to /capture-order
4. Backend: capture_order() → completes payment → returns success/failure

CREDIT CARD PROCESSING:
- PayPal handles credit card processing through their hosted checkout
- Users can pay with cards via "Guest Checkout" (no PayPal account needed)  
- Card details are entered on PayPal's secure servers, not yours
- This eliminates PCI compliance requirements for your application
"""

import os
import sys
import logging
from typing import Dict, Any, Optional
import json
import requests
import base64

# Use the application's logging system architecture
logger = logging.getLogger(__name__)


class PayPalGateway:
    """PayPal Standard Checkout Gateway using Orders API v2"""
    
    def __init__(self, mode: str = "sandbox"):
        """
        Initialize PayPal Gateway for Standard Checkout
        
        Args:
            mode (str): "sandbox" for testing, "live" for production
        """
        self.client_id = os.getenv('PR_PP_CLIENT_ID')
        self.client_secret = os.getenv('PR_PP_SECRET')
        self.mode = mode
        
        if not self.client_id or not self.client_secret:
            raise ValueError(
                "PayPal credentials not found. Set environment variables:\n"
                "PR_PP_CLIENT_ID=your_client_id\n"
                "PR_PP_SECRET=your_client_secret"
            )
        
        # Set base URLs based on mode
        if mode == "sandbox":
            self.base_url = "https://api-m.sandbox.paypal.com"
        else:
            self.base_url = "https://api-m.paypal.com"
        
        logger.info(f"PayPal Standard Checkout Gateway initialized in {self.mode} mode")
    
    def _get_access_token(self) -> Optional[str]:
        """
        Get OAuth access token for Orders API v2 calls
        
        Returns:
            str: Access token or None if failed
        """
        try:
            # Encode credentials
            credentials = f"{self.client_id}:{self.client_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            data = "grant_type=client_credentials"
            
            response = requests.post(
                f"{self.base_url}/v1/oauth2/token",
                headers=headers,
                data=data,
                timeout=30
            )
            
            if response.status_code == 200:
                token_data = response.json()
                return token_data.get('access_token')
            else:
                logger.error(f"Failed to get access token: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting access token: {str(e)}")
            return None
    
    def create_order(self, 
                    amount: str, 
                    currency: str = "USD",
                    description: str = "Payment",
                    intent: str = "CAPTURE") -> Dict[str, Any]:
        """
        Create order using Orders API v2 (Standard Checkout)
        
        Args:
            amount (str): Payment amount (e.g., "15.10")
            currency (str): Currency code (default: USD)  
            description (str): Payment description
            intent (str): "CAPTURE" for immediate payment, "AUTHORIZE" for later capture
            
        Returns:
            Dict: {"success": bool, "order_id": str, "status": str, "error": str}
        """
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {
                    "success": False,
                    "order_id": None,
                    "status": None,
                    "error": "Failed to get access token"
                }
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            order_data = {
                "intent": intent,
                "purchase_units": [{
                    "amount": {
                        "currency_code": currency,
                        "value": amount
                    },
                    "description": description
                }]
            }
            
            response = requests.post(
                f"{self.base_url}/v2/checkout/orders",
                headers=headers,
                data=json.dumps(order_data),
                timeout=30
            )
            
            if response.status_code == 201:
                order = response.json()
                
                logger.info(f"Order created successfully: {order['id']}")
                return {
                    "success": True,
                    "order_id": order['id'],
                    "status": order['status'],
                    "error": None
                }
            else:
                error_msg = f"Order creation failed: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return {
                    "success": False,
                    "order_id": None,
                    "status": None,
                    "error": error_msg
                }
                
        except Exception as e:
            logger.error(f"Error creating order: {str(e)}")
            return {
                "success": False,
                "order_id": None,
                "status": None,
                "error": str(e)
            }
    
    def capture_order(self, order_id: str) -> Dict[str, Any]:
        """
        Capture payment for approved order (Standard Checkout)
        
        Args:
            order_id (str): PayPal order ID
            
        Returns:
            Dict: {"success": bool, "order_id": str, "capture_id": str, "status": str, "error": str}
        """
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {
                    "success": False,
                    "order_id": order_id,
                    "capture_id": None,
                    "status": None,
                    "error": "Failed to get access token"
                }
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                f"{self.base_url}/v2/checkout/orders/{order_id}/capture",
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 201:
                capture_data = response.json()
                
                # Extract capture details
                capture_id = None
                status = capture_data.get('status', 'UNKNOWN')
                
                if 'purchase_units' in capture_data and capture_data['purchase_units']:
                    payments = capture_data['purchase_units'][0].get('payments', {})
                    captures = payments.get('captures', [])
                    if captures:
                        capture_id = captures[0]['id']
                        status = captures[0]['status']
                
                logger.info(f"Order captured successfully: {order_id}")
                return {
                    "success": True,
                    "order_id": order_id,
                    "capture_id": capture_id,
                    "status": status,
                    "error": None
                }
            else:
                error_msg = f"Order capture failed: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return {
                    "success": False,
                    "order_id": order_id,
                    "capture_id": None,
                    "status": None,
                    "error": error_msg
                }
                
        except Exception as e:
            logger.error(f"Error capturing order: {str(e)}")
            return {
                "success": False,
                "order_id": order_id,
                "capture_id": None,
                "status": None,
                "error": str(e)
            }
    
    def get_order_details(self, order_id: str) -> Dict[str, Any]:
        """
        Get order details (Standard Checkout)
        
        Args:
            order_id (str): PayPal order ID
            
        Returns:
            Dict: Order details or error
        """
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {
                    "success": False,
                    "error": "Failed to get access token"
                }
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            response = requests.get(
                f"{self.base_url}/v2/checkout/orders/{order_id}",
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                order_data = response.json()
                
                # Extract relevant information
                amount_info = order_data['purchase_units'][0]['amount']
                
                return {
                    "success": True,
                    "order_id": order_data['id'],
                    "status": order_data['status'],
                    "intent": order_data['intent'],
                    "total": amount_info['value'],
                    "currency": amount_info['currency_code'],
                    "create_time": order_data['create_time'],
                    "update_time": order_data['update_time'],
                    "error": None
                }
            else:
                error_msg = f"Failed to get order details: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return {
                    "success": False,
                    "error": error_msg
                }
                
        except Exception as e:
            logger.error(f"Error getting order details: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def verify_order_completed(self, order_id: str) -> bool:
        """
        Verify if order is completed successfully
        
        Args:
            order_id (str): PayPal order ID
            
        Returns:
            bool: True if order completed, False otherwise
        """
        try:
            details = self.get_order_details(order_id)
            return details.get("success", False) and details.get("status") == "COMPLETED"
        except Exception as e:
            logger.error(f"Error verifying order: {str(e)}")
            return False


def main():
    """Example usage of PayPal Standard Checkout"""
    
    # Check environment variables
    if not os.getenv('PR_PP_CLIENT_ID') or not os.getenv('PR_PP_SECRET'):
        print("Error: Set environment variables PR_PP_CLIENT_ID and PR_PP_SECRET")
        return
    
    try:
        # Initialize gateway
        gateway = PayPalGateway(mode="sandbox")
        print("✓ PayPal Standard Checkout Gateway initialized")
        
        print("""
        📋 PAYPAL STANDARD CHECKOUT INTEGRATION:
        
        🚀 MODERN FLOW (Orders API v2):
        1. Frontend: User clicks PayPal button
        2. createOrder() → POST /create-order → gateway.create_order()
        3. PayPal popup opens → user approves payment
        4. onApprove() → POST /capture-order → gateway.capture_order()
        5. Payment completed → redirect to success page
        
        💳 CREDIT CARD SUPPORT:
        • Same flow works for both PayPal and credit card payments
        • PayPal automatically shows "Pay with Debit or Credit Card" option
        • Guest checkout available (no PayPal account required)
        • Card details processed on PayPal's secure servers
        
        🔧 FLASK INTEGRATION:
        • Use provided HTML template with PayPal JavaScript SDK
        • Create Flask routes: /create-order and /capture-order
        • Include payment.js for frontend handling
        """)
        
        # Example order creation
        print("\n🧪 TESTING ORDER CREATION...")
        
        result = gateway.create_order(
            amount="15.10",
            description="NinjaNerd Monthly Subscription"
        )
        
        if result['success']:
            print(f"✓ Order created: {result['order_id']}")
            print(f"✓ Status: {result['status']}")
            
            # Get order details
            details = gateway.get_order_details(result['order_id'])
            if details['success']:
                print(f"✓ Amount: {details['total']} {details['currency']}")
                print(f"✓ Intent: {details['intent']}")
            
            print(f"\nTo complete payment:")
            print(f"  1. User approves order in PayPal popup")
            print(f"  2. Call: gateway.capture_order('{result['order_id']}')")
            
        else:
            print(f"✗ Order creation failed: {result['error']}")
            
    except Exception as e:
        print(f"✗ Error: {str(e)}")


if __name__ == "__main__":
    main()