import os
import smtplib
import asyncio
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from typing import Optional, Dict
from concurrent.futures import ThreadPoolExecutor

class EmailHandler:
    def __init__(self, gmail_id: Optional[str] = None, gmail_secret: Optional[str] = None):
        self.gmail_id = gmail_id or os.environ.get('PR_GMAIL_ID')
        self.gmail_secret = gmail_secret or os.environ.get('PR_GMAIL_SECRET')
        self.smtp_server = 'smtp.gmail.com'
        self.smtp_port = 587
        self.logger = logging.getLogger('EmailHandler')
        if not self.logger.hasHandlers():
            logging.basicConfig(level=logging.INFO)
        if not self.gmail_id or not self.gmail_secret:
            self.logger.error('Gmail credentials not set in environment variables.')
            raise ValueError('Gmail credentials not set in environment variables.')
        
        # Thread pool for async email operations
        self._executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="EmailHandler")

    def _send_email(self, to_email: str, subject: str, body: str) -> bool:
        """Synchronous email sending method (for backwards compatibility)."""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.gmail_id
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.gmail_id, self.gmail_secret)
                server.send_message(msg)
            self.logger.info(f"Email sent to {to_email} with subject '{subject}'")
            return True
        except Exception as e:
            self.logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    def _send_email_sync(self, to_email: str, subject: str, body: str) -> bool:
        """Internal synchronous email sending method for async operations."""
        return self._send_email(to_email, subject, body)

    def send_email_async(self, to_email: str, subject: str, body: str) -> None:
        """
        Send email asynchronously without blocking the main thread.
        This method returns immediately and handles email sending in the background.
        """
        def email_task():
            try:
                result = self._send_email_sync(to_email, subject, body)
                if result:
                    self.logger.info(f"Async email successfully sent to {to_email}")
                else:
                    self.logger.error(f"Async email failed to send to {to_email}")
            except Exception as e:
                self.logger.error(f"Async email sending failed for {to_email}: {e}")
        
        # Submit to thread pool
        self._executor.submit(email_task)

    def send_account_creation(self, to_email: str, username: str) -> bool:
        """Synchronous account creation email (for backwards compatibility)."""
        subject = "Welcome to NinjaNerd! Your Account Has Been Created"
        body = f"Hello {username},\n\nYour account has been successfully created. Welcome to NinjaNerd!\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)

    def send_account_creation_async(self, to_email: str, username: str) -> None:
        """Asynchronous account creation email."""
        subject = "Welcome to NinjaNerd! Your Account Has Been Created"
        body = f"Hello {username},\n\nYour account has been successfully created. Welcome to NinjaNerd!\n\nBest Regards,\nNinjaNerd Team"
        self.send_email_async(to_email, subject, body)

    def send_feedback(self, to_email: str, user: str, feedback: str) -> bool:
        """Synchronous feedback email (for backwards compatibility)."""
        subject = "Thank you for your feedback!"
        body = f"Hello {user},\n\nThank you for your feedback:\n\n{feedback}\n\nWe appreciate your input.\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)

    def send_feedback_async(self, to_email: str, user: str, feedback: str) -> None:
        """Asynchronous feedback email."""
        subject = "Thank you for your feedback!"
        body = f"Hello {user},\n\nThank you for your feedback:\n\n{feedback}\n\nWe appreciate your input.\n\nBest Regards,\nNinjaNerd Team"
        self.send_email_async(to_email, subject, body)

    def send_payment_processed(self, to_email: str, user: str, receipt_info: Dict[str, str]) -> bool:
        """Synchronous payment processed email (for backwards compatibility)."""
        subject = "Payment Processed Successfully"
        receipt_lines = '\n'.join([f"{k}: {v}" for k, v in receipt_info.items()])
        body = f"Hello {user},\n\nYour payment has been processed successfully. Here are your receipt details:\n\n{receipt_lines}\n\nThank you for your purchase!\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)

    def send_payment_processed_async(self, to_email: str, user: str, receipt_info: Dict[str, str]) -> None:
        """Asynchronous payment processed email."""
        subject = "Payment Processed Successfully"
        receipt_lines = '\n'.join([f"{k}: {v}" for k, v in receipt_info.items()])
        body = f"Hello {user},\n\nYour payment has been processed successfully. Here are your receipt details:\n\n{receipt_lines}\n\nThank you for your purchase!\n\nBest Regards,\nNinjaNerd Team"
        self.send_email_async(to_email, subject, body)

    def send_verification_code(self, to_email: str, verification_code: str) -> bool:
        """Synchronous verification code email."""
        subject = "NinjaNerd Account Verification Code"
        body = f"Your NinjaNerd account verification code is: {verification_code}\n\nThis code will expire in 10 minutes. Please enter this code to complete your account creation.\n\nIf you did not request this code, please ignore this email.\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)

    def send_verification_code_async(self, to_email: str, verification_code: str) -> None:
        """Asynchronous verification code email."""
        subject = "NinjaNerd Account Verification Code"
        body = f"Your NinjaNerd account verification code is: {verification_code}\n\nThis code will expire in 10 minutes. Please enter this code to complete your account creation.\n\nIf you did not request this code, please ignore this email.\n\nBest Regards,\nNinjaNerd Team"
        self.send_email_async(to_email, subject, body)

    def shutdown(self) -> None:
        """Gracefully shutdown the thread pool executor."""
        try:
            self._executor.shutdown(wait=True)
            self.logger.info("EmailHandler thread pool shutdown completed")
        except Exception as e:
            self.logger.error(f"Error during EmailHandler shutdown: {e}")

    def __del__(self):
        """Destructor to ensure thread pool is cleaned up."""
        try:
            if hasattr(self, '_executor'):
                self._executor.shutdown(wait=False)
        except Exception:
            pass  # Ignore errors during cleanup
