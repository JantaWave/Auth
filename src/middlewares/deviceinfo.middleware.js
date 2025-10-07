/**
 * @desc Extract device and browser information from request headers
 * @param {Object} headers - Express request headers
 * @returns {Object} Device information object
 */
const extractDeviceInfo = (headers) => {
  const userAgent = headers["user-agent"] || "";
  const ip =
    headers["x-forwarded-for"]?.split(",")[0].trim() ||
    headers["x-real-ip"] ||
    headers["cf-connecting-ip"] || // Cloudflare
    "unknown";

  // Initialize device info object
  const deviceInfo = {
    ip,
    userAgent,
    browser: "Unknown",
    browserVersion: "Unknown",
    os: "Unknown",
    osVersion: "Unknown",
    device: "Unknown",
    isMobile: false,
    isTablet: false,
    isDesktop: false,
  };

  // Detect Mobile
  const mobileRegex =
    /Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;
  deviceInfo.isMobile = mobileRegex.test(userAgent);

  // Detect Tablet
  const tabletRegex = /Tablet|iPad/i;
  deviceInfo.isTablet = tabletRegex.test(userAgent);

  // Set device type
  if (deviceInfo.isTablet) {
    deviceInfo.device = "Tablet";
  } else if (deviceInfo.isMobile) {
    deviceInfo.device = "Mobile";
  } else {
    deviceInfo.device = "Desktop";
    deviceInfo.isDesktop = true;
  }

  // Detect Browser
  if (userAgent.includes("Edg/") || userAgent.includes("Edge/")) {
    deviceInfo.browser = "Edge";
    const match = userAgent.match(/Edg(?:e)?\/(\d+\.\d+)/);
    deviceInfo.browserVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Chrome/") && !userAgent.includes("Edg")) {
    deviceInfo.browser = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
    deviceInfo.browserVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Firefox/")) {
    deviceInfo.browser = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
    deviceInfo.browserVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome")) {
    deviceInfo.browser = "Safari";
    const match = userAgent.match(/Version\/(\d+\.\d+)/);
    deviceInfo.browserVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Opera") || userAgent.includes("OPR/")) {
    deviceInfo.browser = "Opera";
    const match = userAgent.match(/(?:Opera|OPR)\/(\d+\.\d+)/);
    deviceInfo.browserVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("MSIE") || userAgent.includes("Trident/")) {
    deviceInfo.browser = "Internet Explorer";
    const match = userAgent.match(/(?:MSIE |rv:)(\d+\.\d+)/);
    deviceInfo.browserVersion = match ? match[1] : "Unknown";
  }

  // Detect Operating System
  if (userAgent.includes("Windows NT 10.0")) {
    deviceInfo.os = "Windows";
    deviceInfo.osVersion = "10/11";
  } else if (userAgent.includes("Windows NT 6.3")) {
    deviceInfo.os = "Windows";
    deviceInfo.osVersion = "8.1";
  } else if (userAgent.includes("Windows NT 6.2")) {
    deviceInfo.os = "Windows";
    deviceInfo.osVersion = "8";
  } else if (userAgent.includes("Windows NT 6.1")) {
    deviceInfo.os = "Windows";
    deviceInfo.osVersion = "7";
  } else if (userAgent.includes("Windows")) {
    deviceInfo.os = "Windows";
    const match = userAgent.match(/Windows NT (\d+\.\d+)/);
    deviceInfo.osVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Mac OS X")) {
    deviceInfo.os = "macOS";
    const match = userAgent.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (match) {
      deviceInfo.osVersion = match[1].replace(/_/g, ".");
    }
  } else if (userAgent.includes("Android")) {
    deviceInfo.os = "Android";
    const match = userAgent.match(/Android (\d+\.\d+)/);
    deviceInfo.osVersion = match ? match[1] : "Unknown";
  } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    deviceInfo.os = "iOS";
    const match = userAgent.match(/OS (\d+[._]\d+)/);
    if (match) {
      deviceInfo.osVersion = match[1].replace(/_/g, ".");
    }
  } else if (userAgent.includes("Linux")) {
    deviceInfo.os = "Linux";
  } else if (userAgent.includes("CrOS")) {
    deviceInfo.os = "Chrome OS";
  }

  return deviceInfo;
};

/**
 * @desc Get a simplified device fingerprint string
 * @param {Object} deviceInfo - Device info object
 * @returns {String} Simple device identifier
 */
const getDeviceFingerprint = (deviceInfo) => {
  return `${deviceInfo.device}-${deviceInfo.browser}-${deviceInfo.os}`.toLowerCase();
};

/**
 * @desc Get detailed device string for logging/display
 * @param {Object} deviceInfo - Device info object
 * @returns {String} Human-readable device string
 */
const getDeviceString = (deviceInfo) => {
  const parts = [];

  if (deviceInfo.browser !== "Unknown") {
    parts.push(`${deviceInfo.browser} ${deviceInfo.browserVersion}`);
  }

  if (deviceInfo.os !== "Unknown") {
    const osStr =
      deviceInfo.osVersion !== "Unknown"
        ? `${deviceInfo.os} ${deviceInfo.osVersion}`
        : deviceInfo.os;
    parts.push(`on ${osStr}`);
  }

  if (deviceInfo.device !== "Unknown") {
    parts.push(`(${deviceInfo.device})`);
  }

  return parts.length > 0 ? parts.join(" ") : "Unknown Device";
};

/**
 * @desc Express middleware to attach device info to request object
 * @usage
 * // Global usage
 * app.use(deviceInfoMiddleware);
 *
 * // Route-specific usage
 * router.post("/login", deviceInfoMiddleware, loginController);
 *
 * // Access in controller
 * req.deviceInfo.ip
 * req.deviceInfo.browser
 * req.deviceInfo.device
 * req.deviceInfo.fingerprint
 * req.deviceInfo.displayString
 */
export const deviceInfoMiddleware = (req, res, next) => {
  const deviceInfo = extractDeviceInfo(req.headers);

  // Attach to request object with helper methods
  req.deviceInfo = {
    ...deviceInfo,
    fingerprint: getDeviceFingerprint(deviceInfo),
    displayString: getDeviceString(deviceInfo),
  };

  next();
};
