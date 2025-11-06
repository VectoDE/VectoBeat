"""Custom exception types used across the bot."""


class UserFacingError(Exception):
    """Errors that should be presented to users as embeds."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message
