import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from typing import Optional, Dict

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

    def _send_email(self, to_email: str, subject: str, body: str) -> bool:
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

    def send_account_creation(self, to_email: str, username: str) -> bool:
        subject = "Welcome to NinjaNerd! Your Account Has Been Created"
        body = f"Hello {username},\n\nYour account has been successfully created. Welcome to NinjaNerd!\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)

    def send_feedback(self, to_email: str, user: str, feedback: str) -> bool:
        subject = "Thank you for your feedback!"
        body = f"Hello {user},\n\nThank you for your feedback:\n\n{feedback}\n\nWe appreciate your input.\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)

    def send_payment_processed(self, to_email: str, user: str, receipt_info: Dict[str, str]) -> bool:
        subject = "Payment Processed Successfully"
        receipt_lines = '\n'.join([f"{k}: {v}" for k, v in receipt_info.items()])
        body = f"Hello {user},\n\nYour payment has been processed successfully. Here are your receipt details:\n\n{receipt_lines}\n\nThank you for your purchase!\n\nBest Regards,\nNinjaNerd Team"
        return self._send_email(to_email, subject, body)
