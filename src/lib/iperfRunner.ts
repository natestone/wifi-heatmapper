"use server";
import {
  PartialHeatmapSettings,
  IperfResults,
  IperfTestProperty,
  WifiResults,
} from "./types";
// import { scanWifi, blinkWifi } from "./wifiScanner";
import { execAsync, delay } from "./server-utils";
import { getCancelFlag, sendSSEMessage } from "./server-globals";
import { percentageToRssi, toMbps, getDefaultIperfResults } from "./utils";
import { SSEMessageType } from "@/app/api/events/route";
import { createWifiActions } from "./wifiScanner";
import { getLogger } from "./logger";
const logger = getLogger("iperfRunner");

type TestType = "TCP" | "UDP";
type TestDirection = "Up" | "Down";

const wifiActions = await createWifiActions();

const validateWifiDataConsistency = (
  wifiDataBefore: WifiResults,
  wifiDataAfter: WifiResults,
) => {
  if (
    wifiDataBefore.bssid === wifiDataAfter.bssid &&
    wifiDataBefore.ssid === wifiDataAfter.ssid &&
    wifiDataBefore.band === wifiDataAfter.band &&
    wifiDataBefore.channel === wifiDataAfter.channel
  ) {
    return true;
  }
  const logString = `${JSON.stringify(wifiDataBefore.bssid)} ${JSON.stringify(wifiDataAfter.bssid)}`;
  logger.debug(logString);
};

function arrayAverage(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / arr.length);
}

const initialStates = {
  type: "update",
  header: "Measurement beginning",
  strength: "-",
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
  tcpEnabled: true,
  udpEnabled: true,
  progress: 0,
};

// The measurement process updates these variables
// which then are converted into update events
let displayStates = {
  type: "update",
  header: "In progress",
  strength: "-",
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
  tcpEnabled: true,
  udpEnabled: true,
  progress: 0,
};

/**
 * getUpdatedMessage - combine all the displayState values
 * @returns (SSEMessageType) - the message to send
 */
function getUpdatedMessage(): SSEMessageType {
  let strength = displayStates.strength;
  if (strength != "-") {
    strength += "%";
  }

  // Build status string based on which tests are enabled
  const statusLines = [`Signal strength: ${strength}`];
  if (displayStates.tcpEnabled) {
    statusLines.push(`TCP: ${displayStates.tcp}`);
  }
  if (displayStates.udpEnabled) {
    statusLines.push(`UDP: ${displayStates.udp}`);
  }

  return {
    type: displayStates.type,
    header: displayStates.header,
    status: statusLines.join("\n"),
    tcpEnabled: displayStates.tcpEnabled,
    udpEnabled: displayStates.udpEnabled,
    progress: displayStates.progress,
  };
}

function checkForCancel() {
  if (getCancelFlag()) throw new Error("cancelled");
}

/**
 * runSurveyTests() - get the WiFi and iperf readings
 * @param settings
 * @returns the WiFi and iperf results for this location
 */
export async function runSurveyTests(
  settings: PartialHeatmapSettings,
): Promise<{
  iperfData: IperfResults | null;
  wifiData: WifiResults | null;
  status: string;
}> {
  // first check the settings and return cogent error if not good
  const preResults = await wifiActions.preflightSettings(settings);
  if (preResults.reason != "") {
    logger.debug(`preflightSettings returned: ${JSON.stringify(preResults)}`);
    return { iperfData: null, wifiData: null, status: preResults.reason };
  }
  // check if iperf3 server is available
  // this is separate from the other preflight checks because it's reasonable
  // to test the wifi even the iperf3 server is not accessible
  // (say, you have moved to another subnet)
  let noIperfTestReason = "";
  let performIperfTest = true; // assume we will run iperf3 test
  if (settings.iperfServerAdrs == "localhost") {
    performIperfTest = false;
    noIperfTestReason = "Not performed";
  }
  // otherwise check if the server is available
  else {
    const resp = await wifiActions.checkIperfServer(settings);
    logger.debug(`checkIperfServer returned: ${resp}`);

    if (resp.reason != "") {
      performIperfTest = false;
      noIperfTestReason = resp.reason;
    }
  }

  // begin the survey
  try {
    const maxRetries = 1;
    let attempts = 0;
    const newIperfData = getDefaultIperfResults();
    let newWifiData: WifiResults | null = null;

    // set the initial states, then send an event to the client
    const startTime = Date.now();
    displayStates = {
      ...displayStates,
      ...initialStates,
      tcpEnabled: performIperfTest && settings.iperfTcpEnabled,
      udpEnabled: performIperfTest && settings.iperfUdpEnabled,
    };
    sendSSEMessage(getUpdatedMessage()); // immediately send initial values
    displayStates.header = "Measurement in progress...";

    // This is where the "scan-wifi" branch (now abandoned)
    // would scan the local wifi neighborhood to find the best
    // SSID, then switch to it, then make the measurements.
    // This is too hard on macOS (too many credential prompts)
    // to be practical.

    // Scan the wifi neighborhood, retrieve the ssidName from the current
    const ssids = await wifiActions.scanWifi(settings);
    logger.debug(`scanWifi returned: ${JSON.stringify(ssids)}`);

    const thisSSID = ssids.SSIDs.filter((item) => item.currentSSID);
    const ssidName = thisSSID[0].ssid;

    while (attempts < maxRetries) {
      attempts++;
      try {
        const server = settings.iperfServerAdrs;
        const duration = settings.testDuration;
        const wifiStrengths: number[] = []; // percentages
        // add the SSID to the header if it's not <redacted>
        let newHeader = "Measuring Wi-Fi";
        if (!ssidName.includes("redacted")) {
          newHeader += ` (${ssidName})`;
        }
        displayStates.header = newHeader;

        const wifiDataBefore = await wifiActions.getWifi(settings);
        logger.debug(`getWifi() returned: ${JSON.stringify(wifiDataBefore)}`);
        console.log(
          `Elapsed time for scan and switch: ${Date.now() - startTime}`,
        );
        wifiStrengths.push(wifiDataBefore.SSIDs[0].signalStrength);
        displayStates.strength = arrayAverage(wifiStrengths).toString();
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        // Calculate progress offsets based on which tests are enabled
        const tcpEnabled = performIperfTest && settings.iperfTcpEnabled;
        const udpEnabled = performIperfTest && settings.iperfUdpEnabled;
        const totalTests = (tcpEnabled ? 2 : 0) + (udpEnabled ? 2 : 0); // 2 tests per type (up/down)
        const progressPerTest = totalTests > 0 ? 100 / totalTests : 0;
        let completedTests = 0;

        const createProgressCallback = () => (percent: number) => {
          const baseProgress = completedTests * progressPerTest;
          const testProgress = (percent / 100) * progressPerTest;
          displayStates.progress = Math.round(baseProgress + testProgress);
          sendSSEMessage(getUpdatedMessage());
        };

        // Run the TCP tests
        if (tcpEnabled) {
          displayStates.tcp = "Testing...";
          newIperfData.tcpDownload = await runSingleTest(
            server,
            duration,
            "Down",
            "TCP",
            createProgressCallback(),
          );
          completedTests++;
          displayStates.tcp = `${toMbps(newIperfData.tcpDownload.bitsPerSecond)} / ... Mbps`;
          sendSSEMessage(getUpdatedMessage());

          newIperfData.tcpUpload = await runSingleTest(
            server,
            duration,
            "Up",
            "TCP",
            createProgressCallback(),
          );
          completedTests++;
          displayStates.tcp = `${toMbps(newIperfData.tcpDownload.bitsPerSecond)} / ${toMbps(newIperfData.tcpUpload.bitsPerSecond)} Mbps`;
        } else if (displayStates.tcpEnabled) {
          // Only show status if TCP was supposed to be enabled but iperf server unavailable
          await delay(500);
          displayStates.tcp = noIperfTestReason;
        }
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        const wifiDataMiddle = await wifiActions.getWifi(settings);
        wifiStrengths.push(wifiDataMiddle.SSIDs[0].signalStrength);
        displayStates.strength = arrayAverage(wifiStrengths).toString();
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        // Run the UDP tests
        if (udpEnabled) {
          displayStates.udp = "Testing...";
          newIperfData.udpDownload = await runSingleTest(
            server,
            duration,
            "Down",
            "UDP",
            createProgressCallback(),
          );
          completedTests++;
          displayStates.udp = `${toMbps(newIperfData.udpDownload.bitsPerSecond)} / ... Mbps`;
          sendSSEMessage(getUpdatedMessage());

          newIperfData.udpUpload = await runSingleTest(
            server,
            duration,
            "Up",
            "UDP",
            createProgressCallback(),
          );
          completedTests++;
          displayStates.udp = `${toMbps(newIperfData.udpDownload.bitsPerSecond)} / ${toMbps(newIperfData.udpUpload.bitsPerSecond)} Mbps`;
        } else if (displayStates.udpEnabled) {
          // Only show status if UDP was supposed to be enabled but iperf server unavailable
          await delay(500);
          displayStates.udp = noIperfTestReason;
        }
        displayStates.progress = 100;
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        const wifiDataAfter = await wifiActions.getWifi(settings);
        wifiStrengths.push(wifiDataAfter.SSIDs[0].signalStrength);
        displayStates.strength = arrayAverage(wifiStrengths).toString();
        checkForCancel();

        // Send the final update - type is "done"
        displayStates.type = "done";
        displayStates.header = "Measurement complete";
        sendSSEMessage(getUpdatedMessage());

        if (
          !validateWifiDataConsistency(
            wifiDataBefore.SSIDs[0],
            wifiDataAfter.SSIDs[0],
          )
        ) {
          throw new Error(
            "Wifi configuration changed between scans! Cancelling instead of giving wrong results.",
          );
        }

        const strength = parseInt(displayStates.strength);
        newWifiData = {
          ...wifiDataBefore.SSIDs[0],
          signalStrength: strength, // use the average signalStrength
          rssi: percentageToRssi(strength), // set corresponding RSSI
        };
      } catch (error: any) {
        logger.error(`Attempt ${attempts} failed:`, error);
        if (error.message == "cancelled") {
          return {
            iperfData: null,
            wifiData: null,
            status: "test was cancelled",
          };
        }
      }
    }

    // return the values ("!" asserts that the values are non-null)
    return { iperfData: newIperfData!, wifiData: newWifiData!, status: "" };
  } catch (error) {
    logger.error("Error running measurement tests:", error);
    sendSSEMessage({
      type: "done",
      status: "Error taking measurements",
      header: "Error",
    });

    throw error;
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  testDir: TestDirection,
  testType: TestType,
  onProgress?: (percent: number) => void,
): Promise<IperfTestProperty> {
  const logger = getLogger("runSingleTest");

  let port = "";
  if (server.includes(":")) {
    const [host, serverPort] = server.split(":");
    server = host;
    port = serverPort;
  }
  const isUdp = testType == "UDP";
  const isDownload = testDir == "Down";
  const command = `iperf3 -c ${server} ${
    port ? `-p ${port}` : ""
  } -t ${duration} ${isDownload ? "-R" : ""} ${isUdp ? "-u -b 0" : ""} -J`;

  // Start progress simulation while iperf3 runs
  const testStartTime = Date.now();
  const testDurationMs = duration * 1000;
  let progressInterval: ReturnType<typeof setInterval> | null = null;

  if (onProgress) {
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - testStartTime;
      const percent = Math.min(
        Math.round((elapsed / testDurationMs) * 100),
        99,
      );
      onProgress(percent);
    }, 200); // Update every 200ms
  }

  try {
    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);
    logger.trace("Iperf JSON-parsed result:", result);
    const extracted = extractIperfData(result, isUdp);
    logger.trace("Iperf extracted results:", extracted);
    return extracted;
  } catch (error) {
    logger.error(`iperf3 test failed: ${error}`);
    // Return null results instead of throwing
    return {
      bitsPerSecond: null,
      retransmits: null,
      jitterMs: null,
      lostPackets: null,
      packetsReceived: null,
      signalStrength: 0,
    };
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
      if (onProgress) onProgress(100);
    }
  }
}

function extractIperfData(
  result: {
    end?: {
      sum_received?: { bits_per_second: number };
      sum_sent?: { retransmits?: number };
      sum?: {
        bits_per_second?: number;
        jitter_ms?: number;
        lost_packets?: number;
        packets?: number;
        lost_percent?: number;
        retransmits?: number;
      };
      streams?: Array<{
        udp?: {
          jitter_ms?: number;
          lost_packets?: number;
          packets?: number;
        };
      }>;
    };
    error?: string;
    version?: string;
  },
  isUdp: boolean,
): IperfTestProperty {
  // Handle missing or error results
  if (!result.end) {
    logger.warn(
      `No end data in iperf results: ${result.error || "unknown error"}`,
    );
    return {
      bitsPerSecond: null,
      retransmits: null,
      jitterMs: null,
      lostPackets: null,
      packetsReceived: null,
      signalStrength: 0,
    };
  }

  const end = result.end;

  // Check if we're dealing with newer iPerf (Mac - v3.17+) or older iPerf (Ubuntu - v3.9)
  // Newer versions have sum_received and sum_sent, older versions only have sum
  const isNewVersion = !!end.sum_received;

  /**
   * In newer versions (Mac):
   * - TCP: sum_received contains download/upload bps, sum_sent contains retransmits
   * - UDP: sum_received contains actual received data (~51 Mbps),
   *        sum contains reported test bandwidth (~948 Mbps)
   *
   * In older versions (Ubuntu):
   * - TCP: sum contains both bps and retransmits
   * - UDP: sum contains all metrics (bps, jitter, packet loss)
   */

  // For UDP tests with newer iPerf (Mac), we want to use sum.bits_per_second
  // For TCP tests with newer iPerf, we want to use sum_received.bits_per_second
  // For all tests with older iPerf (Ubuntu), we want to use sum.bits_per_second
  let bitsPerSecond: number | null = null;
  if (isNewVersion) {
    bitsPerSecond = isUdp
      ? (end.sum?.bits_per_second ?? null)
      : (end.sum_received?.bits_per_second ?? null);
  } else {
    bitsPerSecond = end.sum?.bits_per_second ?? null;
  }

  if (bitsPerSecond === null || bitsPerSecond === 0) {
    logger.warn("No bits per second found in iperf results, reporting as --");
    bitsPerSecond = null;
  }

  const retransmits = isNewVersion
    ? (end.sum_sent?.retransmits ?? null)
    : (end.sum?.retransmits ?? null);

  return {
    bitsPerSecond,
    retransmits,

    // UDP metrics - only relevant for UDP tests
    // These fields will be null for TCP tests
    jitterMs: isUdp ? (end.sum?.jitter_ms ?? null) : null,
    lostPackets: isUdp ? (end.sum?.lost_packets ?? null) : null,
    packetsReceived: isUdp ? (end.sum?.packets ?? null) : null,
    signalStrength: 0,
  };
}
