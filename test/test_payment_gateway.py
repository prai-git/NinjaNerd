#!/usr/bin/env python3
"""
Test suite for PayPal payment gateway integration with NinjaNerd.

Tests the PayPal gateway functionality, database integration, 
and payment workflow end-to-end.
"""

import sys
import os
import tempfile
import shutil
import unittest
from unittest.mock import Mock, patch, MagicMock
import json
from datetime import datetime, timedelta

# Add project root to path to import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Test imports
try:
    from gw.ppgw import PayPalGateway
    from dbmgr.sqlite_app_integration import SQLiteAppIntegration
    import nnrpi
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("📁 Make sure you're running from the correct directory")
    sys.exit(1)


class TestPayPalGateway(unittest.TestCase):
    """Test PayPal gateway functionality"""
    
    @patch.dict(os.environ, {'PR_PP_CLIENT_ID': 'test_client_id', 'PR_PP_SECRET': 'test_secret'})
    def setUp(self):
        """Set up test environment"""
        self.gateway = PayPalGateway(mode="sandbox")
    
    def test_gateway_initialization(self):
        """Test PayPal gateway initialization"""
        self.assertEqual(self.gateway.mode, "sandbox")
        self.assertEqual(self.gateway.client_id, "test_client_id")
        self.assertEqual(self.gateway.client_secret, "test_secret")
        self.assertEqual(self.gateway.base_url, "https://api-m.sandbox.paypal.com")
    
    def test_gateway_initialization_live_mode(self):
        """Test PayPal gateway initialization in live mode"""
        with patch.dict(os.environ, {'PR_PP_CLIENT_ID': 'live_client', 'PR_PP_SECRET': 'live_secret'}):
            live_gateway = PayPalGateway(mode="live")
            self.assertEqual(live_gateway.mode, "live")
            self.assertEqual(live_gateway.base_url, "https://api-m.paypal.com")
    
    def test_gateway_initialization_missing_credentials(self):
        """Test PayPal gateway initialization with missing credentials"""
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError) as context:
                PayPalGateway()
            self.assertIn("PayPal credentials not found", str(context.exception))
    
    @patch('requests.post')
    def test_get_access_token_success(self, mock_post):
        """Test successful access token retrieval"""
        # Mock successful token response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'access_token': 'test_token_123'}
        mock_post.return_value = mock_response
        
        token = self.gateway._get_access_token()
        self.assertEqual(token, 'test_token_123')
        
        # Verify request was made with correct parameters
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertIn('/v1/oauth2/token', args[0])
        self.assertIn('Authorization', kwargs['headers'])
        self.assertEqual(kwargs['data'], 'grant_type=client_credentials')
    
    @patch('requests.post')
    def test_get_access_token_failure(self, mock_post):
        """Test access token retrieval failure"""
        # Mock failed token response
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.text = 'Unauthorized'
        mock_post.return_value = mock_response
        
        token = self.gateway._get_access_token()
        self.assertIsNone(token)
    
    @patch('gw.ppgw.PayPalGateway._get_access_token')
    @patch('requests.post')
    def test_create_order_success(self, mock_post, mock_get_token):
        """Test successful order creation"""
        # Mock access token
        mock_get_token.return_value = 'test_token'
        
        # Mock successful order creation response
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            'id': 'ORDER123',
            'status': 'CREATED'
        }
        mock_post.return_value = mock_response
        
        result = self.gateway.create_order(
            amount="15.10",
            description="Test payment"
        )
        
        self.assertTrue(result['success'])
        self.assertEqual(result['order_id'], 'ORDER123')
        self.assertEqual(result['status'], 'CREATED')
        self.assertIsNone(result['error'])
    
    @patch('gw.ppgw.PayPalGateway._get_access_token')
    def test_create_order_no_token(self, mock_get_token):
        """Test order creation when token retrieval fails"""
        mock_get_token.return_value = None
        
        result = self.gateway.create_order(amount="15.10")
        
        self.assertFalse(result['success'])
        self.assertIsNone(result['order_id'])
        self.assertIn('access token', result['error'])
    
    @patch('gw.ppgw.PayPalGateway._get_access_token')
    @patch('requests.post')
    def test_capture_order_success(self, mock_post, mock_get_token):
        """Test successful order capture"""
        # Mock access token
        mock_get_token.return_value = 'test_token'
        
        # Mock successful capture response
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            'id': 'ORDER123',
            'status': 'COMPLETED',
            'purchase_units': [{
                'payments': {
                    'captures': [{
                        'id': 'CAPTURE123',
                        'status': 'COMPLETED'
                    }]
                }
            }]
        }
        mock_post.return_value = mock_response
        
        result = self.gateway.capture_order('ORDER123')
        
        self.assertTrue(result['success'])
        self.assertEqual(result['order_id'], 'ORDER123')
        self.assertEqual(result['capture_id'], 'CAPTURE123')
        self.assertEqual(result['status'], 'COMPLETED')
    
    @patch('gw.ppgw.PayPalGateway._get_access_token')
    @patch('requests.get')
    def test_get_order_details_success(self, mock_get, mock_get_token):
        """Test successful order details retrieval"""
        # Mock access token
        mock_get_token.return_value = 'test_token'
        
        # Mock successful order details response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'ORDER123',
            'status': 'COMPLETED',
            'intent': 'CAPTURE',
            'create_time': '2025-09-22T10:00:00Z',
            'update_time': '2025-09-22T10:05:00Z',
            'purchase_units': [{
                'amount': {
                    'currency_code': 'USD',
                    'value': '15.10'
                }
            }]
        }
        mock_get.return_value = mock_response
        
        result = self.gateway.get_order_details('ORDER123')
        
        self.assertTrue(result['success'])
        self.assertEqual(result['order_id'], 'ORDER123')
        self.assertEqual(result['status'], 'COMPLETED')
        self.assertEqual(result['total'], '15.10')
        self.assertEqual(result['currency'], 'USD')


class TestPaymentDatabaseIntegration(unittest.TestCase):
    """Test payment database integration"""
    
    def setUp(self):
        """Set up test database"""
        self.test_db_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_db_dir, 'test_payments.db')
        
        # Initialize database integration
        self.db_integration = SQLiteAppIntegration(
            db_path=self.db_path,
            max_connections=5,
            enable_message_obfuscation=False
        )
        
        # Create proper mock Flask app with config attribute
        mock_app = Mock()
        mock_app.config = {}  # Provide empty config dict
        mock_app.extensions = {}  # Provide extensions dict
        self.db_integration.init_app(mock_app)
        
        # Create test user
        self.test_email = "testuser@example.com"
        self.db_integration.create_user(self.test_email, "test_password", "Test School")
    
    def tearDown(self):
        """Clean up test database"""
        if self.db_integration:
            self.db_integration._cleanup()
        if os.path.exists(self.test_db_dir):
            shutil.rmtree(self.test_db_dir)
    
    def test_create_payment_record(self):
        """Test creating a payment record"""
        success = self.db_integration.create_payment_record(
            self.test_email,
            "ORDER123",
            15.10,
            "USD"
        )
        
        self.assertTrue(success)
        
        # Verify payment was created
        payments = self.db_integration.get_user_payments(self.test_email)
        self.assertEqual(len(payments), 1)
        self.assertEqual(payments[0]['paypal_order_id'], "ORDER123")
        self.assertEqual(payments[0]['amount'], 15.10)
        self.assertEqual(payments[0]['status'], 'pending')
    
    def test_update_payment_status(self):
        """Test updating payment status"""
        # Create initial payment record
        self.db_integration.create_payment_record(
            self.test_email,
            "ORDER123",
            15.10,
            "USD"
        )
        
        # Update to completed
        success = self.db_integration.update_payment_status(
            "ORDER123",
            "completed",
            "CAPTURE123"
        )
        
        self.assertTrue(success)
        
        # Verify update
        payments = self.db_integration.get_user_payments(self.test_email)
        self.assertEqual(len(payments), 1)
        self.assertEqual(payments[0]['status'], 'completed')
        self.assertEqual(payments[0]['paypal_capture_id'], 'CAPTURE123')
        self.assertIsNotNone(payments[0]['expiry_timestamp'])
    
    def test_get_active_payment(self):
        """Test getting active payment"""
        # Create and complete a payment
        self.db_integration.create_payment_record(
            self.test_email,
            "ORDER123",
            15.10,
            "USD"
        )
        self.db_integration.update_payment_status("ORDER123", "completed", "CAPTURE123")
        
        # Get active payment
        active_payment = self.db_integration.get_active_payment(self.test_email)
        
        self.assertIsNotNone(active_payment)
        self.assertEqual(active_payment['paypal_order_id'], "ORDER123")
        self.assertEqual(active_payment['status'], 'completed')
    
    def test_can_make_payment(self):
        """Test payment eligibility check"""
        # New users are in free trial and cannot make payment initially
        self.assertFalse(self.db_integration.can_make_payment(self.test_email))
        
        # Simulate user with expired trial by updating their creation date
        with self.db_integration.sqlite_manager.connection_pool.get_connection() as conn:
            cursor = conn.cursor()
            # Set user creation date to 20 days ago (past trial period)
            twenty_days_ago = (datetime.now() - timedelta(days=20)).strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(
                "UPDATE users SET created_at = ? WHERE email = ?",
                (twenty_days_ago, self.test_email)
            )
            conn.commit()
        
        # Now user should be able to make payment (trial expired)
        self.assertTrue(self.db_integration.can_make_payment(self.test_email))
        
        # Create and complete a payment
        self.db_integration.create_payment_record(
            self.test_email,
            "ORDER123",
            15.10,
            "USD"
        )
        self.db_integration.update_payment_status("ORDER123", "completed", "CAPTURE123")
        
        # Now user should not be able to make another payment (already has active payment)
        self.assertFalse(self.db_integration.can_make_payment(self.test_email))
    
    def test_multiple_payments_history(self):
        """Test retrieving multiple payments history"""
        # Create multiple payment records
        orders = ["ORDER123", "ORDER456", "ORDER789"]
        
        for i, order_id in enumerate(orders):
            self.db_integration.create_payment_record(
                self.test_email,
                order_id,
                15.10,
                "USD"
            )
            
            # Complete some payments
            if i < 2:
                self.db_integration.update_payment_status(order_id, "completed", f"CAPTURE{i}")
        
        # Get payment history
        payments = self.db_integration.get_user_payments(self.test_email)
        
        self.assertEqual(len(payments), 3)
        
        # Check that completed payments have capture IDs
        completed_payments = [p for p in payments if p['status'] == 'completed']
        self.assertEqual(len(completed_payments), 2)
        
        for payment in completed_payments:
            self.assertIsNotNone(payment['paypal_capture_id'])
            self.assertIsNotNone(payment['expiry_timestamp'])


class TestPaymentWorkflow(unittest.TestCase):
    """Test complete payment workflow"""
    
    def setUp(self):
        """Set up test environment"""
        self.test_db_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_db_dir, 'test_workflow.db')
        
        # Mock environment variables
        self.env_patcher = patch.dict(os.environ, {
            'PR_PP_CLIENT_ID': 'test_client_id',
            'PR_PP_SECRET': 'test_secret'
        })
        self.env_patcher.start()
        
        # Initialize components
        self.db_integration = SQLiteAppIntegration(
            db_path=self.db_path,
            max_connections=5,
            enable_message_obfuscation=False
        )
        
        # Create proper mock Flask app with config attribute
        mock_app = Mock()
        mock_app.config = {}  # Provide empty config dict
        mock_app.extensions = {}  # Provide extensions dict
        self.db_integration.init_app(mock_app)
        
        self.gateway = PayPalGateway(mode="sandbox")
        
        # Create test user
        self.test_email = "workflow@example.com"
        self.db_integration.create_user(self.test_email, "test_password", "Test School")
        
        # Simulate expired trial by updating user creation date to 20 days ago
        from datetime import datetime, timedelta
        twenty_days_ago = (datetime.now() - timedelta(days=20)).strftime('%Y-%m-%d %H:%M:%S')
        with self.db_integration.sqlite_manager.connection_pool.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE users SET created_at = ? WHERE email = ?",
                (twenty_days_ago, self.test_email)
            )
            conn.commit()
    
    def tearDown(self):
        """Clean up test environment"""
        self.env_patcher.stop()
        if self.db_integration:
            self.db_integration._cleanup()
        if os.path.exists(self.test_db_dir):
            shutil.rmtree(self.test_db_dir)
    
    @patch('requests.post')
    @patch('requests.get')
    def test_complete_payment_workflow(self, mock_get, mock_post):
        """Test complete payment workflow from order creation to completion"""
        # Mock PayPal responses
        
        # 1. Mock access token request
        token_response = Mock()
        token_response.status_code = 200
        token_response.json.return_value = {'access_token': 'test_token'}
        
        # 2. Mock order creation
        order_response = Mock()
        order_response.status_code = 201
        order_response.json.return_value = {
            'id': 'ORDER123',
            'status': 'CREATED'
        }
        
        # 3. Mock order capture
        capture_response = Mock()
        capture_response.status_code = 201
        capture_response.json.return_value = {
            'id': 'ORDER123',
            'status': 'COMPLETED',
            'purchase_units': [{
                'payments': {
                    'captures': [{
                        'id': 'CAPTURE123',
                        'status': 'COMPLETED'
                    }]
                }
            }]
        }
        
        # 4. Mock order details
        details_response = Mock()
        details_response.status_code = 200
        details_response.json.return_value = {
            'id': 'ORDER123',
            'status': 'COMPLETED',
            'intent': 'CAPTURE',
            'create_time': '2025-09-22T10:00:00Z',
            'update_time': '2025-09-22T10:05:00Z',
            'purchase_units': [{
                'amount': {
                    'currency_code': 'USD',
                    'value': '15.10'
                }
            }]
        }
        
        # Set up mock responses in order
        mock_post.side_effect = [token_response, order_response, token_response, capture_response, token_response]
        mock_get.return_value = details_response
        
        # Step 1: Check user can make payment
        self.assertTrue(self.db_integration.can_make_payment(self.test_email))
        
        # Step 2: Create order
        order_result = self.gateway.create_order(
            amount="15.10",
            description="NinjaNerd Monthly Subscription"
        )
        
        self.assertTrue(order_result['success'])
        order_id = order_result['order_id']
        
        # Step 3: Save payment record
        self.assertTrue(
            self.db_integration.create_payment_record(
                self.test_email,
                order_id,
                15.10,
                "USD"
            )
        )
        
        # Step 4: Capture order
        capture_result = self.gateway.capture_order(order_id)
        self.assertTrue(capture_result['success'])
        
        # Step 5: Update payment status
        self.assertTrue(
            self.db_integration.update_payment_status(
                order_id,
                "completed",
                capture_result['capture_id']
            )
        )
        
        # Step 6: Verify final state
        active_payment = self.db_integration.get_active_payment(self.test_email)
        self.assertIsNotNone(active_payment)
        self.assertEqual(active_payment['status'], 'completed')
        
        # User should no longer be able to make payment
        self.assertFalse(self.db_integration.can_make_payment(self.test_email))
        
        # Get order details
        details = self.gateway.get_order_details(order_id)
        self.assertTrue(details['success'])
        self.assertEqual(details['total'], '15.10')


def run_payment_tests():
    """Run all payment-related tests"""
    print("🧪 Running Payment Gateway Tests...")
    print("=" * 50)
    
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add test classes
    test_classes = [
        TestPayPalGateway,
        TestPaymentDatabaseIntegration,
        TestPaymentWorkflow
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # Print summary
    print("\n" + "=" * 50)
    print("🧪 Payment Gateway Test Summary")
    print("=" * 50)
    print(f"✅ Tests run: {result.testsRun}")
    print(f"❌ Failures: {len(result.failures)}")
    print(f"⚠️  Errors: {len(result.errors)}")
    
    if result.failures:
        print("\n❌ FAILURES:")
        for test, traceback in result.failures:
            print(f"  - {test}: {traceback.split('AssertionError:')[-1].strip()}")
    
    if result.errors:
        print("\n⚠️  ERRORS:")
        for test, traceback in result.errors:
            print(f"  - {test}: {traceback.split('Exception:')[-1].strip()}")
    
    success = len(result.failures) == 0 and len(result.errors) == 0
    
    if success:
        print("\n🎉 All payment tests passed!")
    else:
        print("\n💥 Some payment tests failed!")
    
    print("=" * 50)
    
    return success


class TestPaymentUI(unittest.TestCase):
    """Test payment UI components and navigation"""
    
    def test_checkout_page_has_back_button(self):
        """Test that checkout page template includes back button"""
        checkout_template_path = os.path.join(
            os.path.dirname(__file__), '..', 'templates', 'payment', 'checkout.html'
        )
        
        self.assertTrue(os.path.exists(checkout_template_path), "Checkout template should exist")
        
        with open(checkout_template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check for back button
        self.assertIn('Back', content, "Checkout page should have back button")
        self.assertIn('fa-arrow-left', content, "Back button should have arrow icon")
        self.assertIn("url_for('payment')", content, "Back button should link to payment page")
    
    def test_privacy_policy_route_exists(self):
        """Test that privacy policy route and template exist"""
        # Check privacy policy file exists
        privacy_file_path = os.path.join(
            os.path.dirname(__file__), '..', 'data', 'privacy_policy.txt'
        )
        self.assertTrue(os.path.exists(privacy_file_path), "Privacy policy file should exist")
        
        # Check privacy policy template exists
        privacy_template_path = os.path.join(
            os.path.dirname(__file__), '..', 'templates', 'payment', 'privacy_policy.html'
        )
        self.assertTrue(os.path.exists(privacy_template_path), "Privacy policy template should exist")
        
        # Check template has back button
        with open(privacy_template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        self.assertIn('Back', content, "Privacy policy should have back button")
        self.assertIn('fa-arrow-left', content, "Back button should have arrow icon")
    
    def test_terms_conditions_no_new_tab(self):
        """Test that terms and conditions link doesn't open in new tab and has proper back button"""
        payment_template_path = os.path.join(
            os.path.dirname(__file__), '..', 'templates', 'payment', 'payment.html'
        )
        
        self.assertTrue(os.path.exists(payment_template_path), "Payment template should exist")
        
        with open(payment_template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Should have terms link but without target="_blank"
        self.assertIn("url_for('terms_and_conditions')", content, "Should have terms link")
        
        # Check that terms link doesn't have target="_blank"
        lines = content.split('\n')
        terms_lines = [line for line in lines if 'terms_and_conditions' in line.lower()]
        
        for line in terms_lines:
            if 'href' in line and 'terms_and_conditions' in line:
                self.assertNotIn('target="_blank"', line, 
                               "Terms link should not open in new tab")
        
        # Check terms template has back button in header
        terms_template_path = os.path.join(
            os.path.dirname(__file__), '..', 'templates', 'payment', 'terms_and_conditions.html'
        )
        
        self.assertTrue(os.path.exists(terms_template_path), "Terms template should exist")
        
        with open(terms_template_path, 'r', encoding='utf-8') as f:
            terms_content = f.read()
        
        # Check that back button is in the card header (like payment history)
        self.assertIn('d-flex justify-content-between align-items-center', terms_content, 
                     "Terms should have flexbox layout in header")
        self.assertIn('btn btn-light btn-sm', terms_content, 
                     "Back button should be styled like payment history")
        self.assertIn('Back', terms_content, "Should have back button")


if __name__ == "__main__":
    print("🚀 NinjaNerd Payment Gateway Test Suite")
    print("Testing PayPal integration and payment workflows...")
    print()
    
    try:
        # Run payment gateway tests
        success = run_payment_tests()
        
        # Run UI tests
        print("\n" + "=" * 50)
        print("🎨 Running Payment UI Tests...")
        print("=" * 50)
        
        ui_suite = unittest.TestLoader().loadTestsFromTestCase(TestPaymentUI)
        ui_runner = unittest.TextTestRunner(verbosity=2)
        ui_result = ui_runner.run(ui_suite)
        
        print(f"\n✅ UI Tests run: {ui_result.testsRun}")
        print(f"❌ UI Failures: {len(ui_result.failures)}")
        print(f"⚠️  UI Errors: {len(ui_result.errors)}")
        
        ui_success = len(ui_result.failures) == 0 and len(ui_result.errors) == 0
        
        if ui_success:
            print("🎉 All UI tests passed!")
        else:
            print("💥 Some UI tests failed!")
            
            if ui_result.failures:
                for test, traceback in ui_result.failures:
                    print(f"❌ {test}: {traceback}")
            
            if ui_result.errors:
                for test, traceback in ui_result.errors:
                    print(f"⚠️  {test}: {traceback}")
        
        # Overall success
        overall_success = success and ui_success
        sys.exit(0 if overall_success else 1)
        
    except KeyboardInterrupt:
        print("\n⏹️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Test runner error: {e}")
        sys.exit(1)