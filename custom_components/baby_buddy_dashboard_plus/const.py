"""Constants for the Baby Buddy Dashboard Plus Home Assistant integration."""

from typing import Final

DOMAIN: Final = "baby_buddy_dashboard_plus"
SERVICE_LOG_CARE: Final = "log_care"
ATTR_CARE_TYPE: Final = "care_type"
ATTR_CATEGORY_LABEL: Final = "category_label"
ATTR_NOTES: Final = "notes"
ATTR_TIME: Final = "time"

# The repository slug is stable for the official Plus add-on repository.  It
# is an internal Docker hostname, not a URL exposed to the user's LAN.
DEFAULT_ADDON_URL: Final = "http://944ded0b-baby-buddy-dashboard-plus:8099"
PAIR_PATH: Final = "/api/ha/integration/pair"
CARE_PATH: Final = "/api/ha/integration/care"
CONF_ADDON_URL: Final = "addon_url"
CONF_INTEGRATION_TOKEN: Final = "integration_token"
CONF_PAIRING_CODE: Final = "pairing_code"

CARE_TYPES: Final = (
    "bath",
    "full_wash",
    "quick_wash",
    "caraway_oil",
    "nail_care",
    "skin_care",
    "custom",
)
