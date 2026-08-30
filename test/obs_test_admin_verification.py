#!/usr/bin/env python3
"""
Quick verification test for admin user handling in free trial and payment features.
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))

from dbmgr.sqlite_app_integration import SQLiteAppIntegration

def test_admin_user_features():
    """Test that admin users are properly handled in free trial and payment features"""
    
    # Create a temporary database for testing
    import tempfile
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_admin.db")
    
    # Initialize database integration
    db = SQLiteAppIntegration(
        db_path=test_db_path,
        max_connections=5,
        enable_message_obfuscation=False
    )
    
    admin_email = "admin@gmail.com"
    regular_email = "user@test.com"
    
    try:
        # Test admin user free trial logic
        print("Testing admin user free trial logic...")
        
        # Admin should not be in free trial (they have permanent free access)
        assert not db.is_in_free_trial(admin_email), "Admin should not be in free trial"
        print("✅ Admin user is not in free trial")
        
        # Admin should have 0 trial days remaining
        assert db.get_free_trial_days_remaining(admin_email) == 0, "Admin should have 0 trial days"
        print("✅ Admin user has 0 trial days remaining")
        
        # Admin should not require payment for access
        assert not db.requires_payment_for_access(admin_email), "Admin should not require payment"
        print("✅ Admin user does not require payment for access")
        
        # Admin should not be able to make payment (they don't need to)
        assert not db.can_make_payment(admin_email), "Admin should not be able to make payment"
        print("✅ Admin user cannot make payment (they don't need to)")
        
        # Test regular user to ensure normal behavior still works
        print("\nTesting regular user behavior...")
        
        # Create a regular user first
        success = db.create_user(regular_email, "hashed_password", "Test School")
        if success:
            # Regular new user should be in free trial
            assert db.is_in_free_trial(regular_email), "Regular user should be in free trial"
            print("✅ Regular user is in free trial")
            
            # Regular user should have trial days remaining  
            days_remaining = db.get_free_trial_days_remaining(regular_email)
            assert days_remaining > 0, "Regular user should have trial days remaining"
            print(f"✅ Regular user has {days_remaining} trial days remaining")
            
            # Regular user should not require payment during trial
            assert not db.requires_payment_for_access(regular_email), "Regular user should not require payment during trial"
            print("✅ Regular user does not require payment during trial")
            
            # Regular user should not be able to make payment during trial
            assert not db.can_make_payment(regular_email), "Regular user should not be able to make payment during trial"
            print("✅ Regular user cannot make payment during trial")
        
        print("\n🎉 All admin user feature tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    finally:
        # Clean up
        try:
            os.remove(test_db_path)
            os.rmdir(temp_dir)
        except:
            pass

if __name__ == "__main__":
    success = test_admin_user_features()
    sys.exit(0 if success else 1)