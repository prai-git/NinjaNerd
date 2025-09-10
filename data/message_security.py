"""
Message obfuscation utility for chat messages.
Uses XOR cipher for simple but effective obfuscation of chat messages in storage.
"""

import base64
import hashlib


class MessageObfuscator:
    """
    Simple XOR-based message obfuscation for chat messages.
    Provides basic security for stored messages without complex encryption.
    """
    
    def __init__(self, secret_key: str = None):
        """
        Initialize the obfuscator with a secret key.
        
        Args:
            secret_key: Optional secret key. If None, uses a default key.
        """
        if secret_key is None:
            # Default key - in production, this should be from environment
            secret_key = "NinjaNerd-Chat-Security-2025"
        
        # Create a repeatable key from the secret
        self.key = self._generate_key(secret_key)
    
    def _generate_key(self, secret: str) -> bytes:
        """
        Generate a stable key from the secret string.
        
        Args:
            secret: Secret string to generate key from
            
        Returns:
            Bytes key for XOR operations
        """
        # Use SHA256 to create a stable key from the secret
        return hashlib.sha256(secret.encode('utf-8')).digest()
    
    def obfuscate_message(self, message: str) -> str:
        """
        Obfuscate a message using XOR cipher.
        
        Args:
            message: Plain text message to obfuscate
            
        Returns:
            Base64 encoded obfuscated message
        """
        if not message:
            return message
        
        # Convert message to bytes
        message_bytes = message.encode('utf-8')
        
        # XOR each byte with key (cycling through key bytes)
        obfuscated_bytes = bytearray()
        for i, byte in enumerate(message_bytes):
            key_byte = self.key[i % len(self.key)]
            obfuscated_bytes.append(byte ^ key_byte)
        
        # Encode to base64 for safe storage
        return base64.b64encode(obfuscated_bytes).decode('ascii')
    
    def deobfuscate_message(self, obfuscated_message: str) -> str:
        """
        Deobfuscate a message using XOR cipher.
        
        Args:
            obfuscated_message: Base64 encoded obfuscated message
            
        Returns:
            Plain text message
        """
        if not obfuscated_message:
            return obfuscated_message
        
        try:
            # Decode from base64
            obfuscated_bytes = base64.b64decode(obfuscated_message.encode('ascii'))
            
            # XOR each byte with key (cycling through key bytes)
            message_bytes = bytearray()
            for i, byte in enumerate(obfuscated_bytes):
                key_byte = self.key[i % len(self.key)]
                message_bytes.append(byte ^ key_byte)
            
            # Convert back to string
            return message_bytes.decode('utf-8')
        
        except Exception as e:
            # If deobfuscation fails, return original (might be plain text)
            return obfuscated_message
    
    def is_obfuscated(self, message: str) -> bool:
        """
        Check if a message appears to be obfuscated (base64 encoded).
        
        Args:
            message: Message to check
            
        Returns:
            True if message appears obfuscated, False otherwise
        """
        if not message:
            return False
        
        try:
            # Simple heuristic: if it's valid base64 and when deobfuscated produces 
            # different content, then it's likely obfuscated
            import re
            
            # Must look like base64
            if not re.match(r'^[A-Za-z0-9+/]*={0,2}$', message):
                return False
                
            # Must be decodable as base64
            base64.b64decode(message.encode('ascii'))
            
            # If deobfuscating produces different content, it was likely obfuscated
            deobfuscated = self.deobfuscate_message(message)
            return deobfuscated != message
            
        except Exception:
            return False


# Global instance for application use
message_obfuscator = MessageObfuscator()

def obfuscate_message(message: str) -> str:
    """
    Convenience function to obfuscate a message.
    
    Args:
        message: Plain text message
        
    Returns:
        Obfuscated message
    """
    return message_obfuscator.obfuscate_message(message)

def deobfuscate_message(obfuscated_message: str) -> str:
    """
    Convenience function to deobfuscate a message.
    
    Args:
        obfuscated_message: Obfuscated message
        
    Returns:
        Plain text message
    """
    return message_obfuscator.deobfuscate_message(obfuscated_message)

def is_message_obfuscated(message: str) -> bool:
    """
    Convenience function to check if a message is obfuscated.
    
    Args:
        message: Message to check
        
    Returns:
        True if obfuscated, False otherwise
    """
    return message_obfuscator.is_obfuscated(message)
