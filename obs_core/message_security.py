"""
Message obfuscation utility for chat messages.
Uses XOR cipher for simple but effective obfuscation of chat messages in storage.
"""

import base64
import hashlib
import os


# Obfuscation prefix for versioned format
OBFUSCATION_PREFIX = "obf1:"


def _get_obfuscation_key() -> bytes:
    """
    Get the stable obfuscation key from environment.
    
    Returns:
        Bytes key for XOR operations
        
    Raises:
        RuntimeError: If MESSAGE_OBFUSCATION_KEY is not set
    """
    key = os.getenv("MESSAGE_OBFUSCATION_KEY", "").strip()
    if not key:
        # Fail fast so we don't silently produce unreadable messages
        raise RuntimeError("MESSAGE_OBFUSCATION_KEY environment variable is not set")
    
    # Use SHA256 to create a stable key from the secret
    return hashlib.sha256(key.encode('utf-8')).digest()


class MessageObfuscator:
    """
    Simple XOR-based message obfuscation for chat messages.
    Provides basic security for stored messages without complex encryption.
    Uses stable environment-based key and versioned prefix format.
    """
    
    def __init__(self, secret_key: str = None):
        """
        Initialize the obfuscator with a secret key.
        
        Args:
            secret_key: Optional secret key. If None, uses environment key.
        """
        if secret_key is None:
            # Use stable environment-based key
            self.key = _get_obfuscation_key()
        else:
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
        Obfuscate a message using XOR cipher with versioned prefix.
        
        Args:
            message: Plain text message to obfuscate
            
        Returns:
            Prefixed and base64 encoded obfuscated message
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
        
        # Encode to base64 and add versioned prefix for safe storage
        encoded = base64.b64encode(obfuscated_bytes).decode('ascii')
        return OBFUSCATION_PREFIX + encoded
    
    def deobfuscate_message(self, obfuscated_message: str) -> str:
        """
        Deobfuscate a message using XOR cipher.
        
        Args:
            obfuscated_message: Prefixed and base64 encoded obfuscated message
            
        Returns:
            Plain text message
        """
        if not obfuscated_message:
            return obfuscated_message
        
        # If not obfuscated, return as-is
        if not self.is_obfuscated(obfuscated_message):
            return obfuscated_message
        
        try:
            # Remove prefix and decode from base64
            payload = obfuscated_message[len(OBFUSCATION_PREFIX):]
            obfuscated_bytes = base64.b64decode(payload.encode('ascii'))
            
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
        Check if a message is obfuscated by checking for the versioned prefix.
        
        Args:
            message: Message to check
            
        Returns:
            True if message has obfuscation prefix, False otherwise
        """
        return isinstance(message, str) and message.startswith(OBFUSCATION_PREFIX)


# Global instance for application use
try:
    message_obfuscator = MessageObfuscator()
except RuntimeError:
    # If environment key is not set, use fallback for development/testing
    message_obfuscator = MessageObfuscator("NinjaNerd-Chat-Security-2025-Fallback")


def obfuscate_message(message: str) -> str:
    """
    Convenience function to obfuscate a message.
    
    Args:
        message: Plain text message
        
    Returns:
        Obfuscated message with versioned prefix
    """
    return message_obfuscator.obfuscate_message(message)

def deobfuscate_message(obfuscated_message: str) -> str:
    """
    Convenience function to deobfuscate a message.
    
    Args:
        obfuscated_message: Obfuscated message with versioned prefix
        
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
        True if obfuscated (has prefix), False otherwise
    """
    return message_obfuscator.is_obfuscated(message)
