"""Transactional email via Resend (D-09). Dev bypass when ENVIRONMENT=development (D-10)."""

import os

from loguru import logger

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


async def send_magic_link(to_email: str, magic_link: str, assessment_title: str) -> bool:
    """Send a magic link email to the student.

    In development mode, logs the link instead of sending email.
    """
    if ENVIRONMENT == "development":
        logger.info(f"[DEV] Magic link for {to_email}: {magic_link}")
        return True
    try:
        import resend
        resend.api_key = os.getenv("RESEND_API_KEY", "")
        params: resend.Emails.SendParams = {
            "from": os.getenv("RESEND_FROM_EMAIL", "Argo <noreply@yourdomain.com>"),
            "to": [to_email],
            "subject": f"Your link for: {assessment_title}",
            "html": (
                f"<p>Click to start your assessment:</p>"
                f"<p><a href='{magic_link}'>{magic_link}</a></p>"
                f"<p>This link expires in 15 minutes.</p>"
            ),
        }
        await resend.Emails.send_async(params)
        return True
    except Exception as e:
        logger.error(f"Email send failed for {to_email}: {e}")
        return False
