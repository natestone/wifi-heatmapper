import { useSettings } from "@/components/GlobalSettings";
import { validateIperfSettings } from "@/components/GlobalSettings";
import { PasswordInput } from "./PasswordInput";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import HeatmapAdvancedConfig from "./HeatmapAdvancedConfig";
import MediaDropdown from "./MediaDropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";

export default function SettingsEditor() {
  const {
    settings,
    updateSettings,
    readNewSettingsFromFile,
    sudoPasswordError,
    setSudoPasswordError,
  } = useSettings();
  const [showServerDropdown, setShowServerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const bandwidthTestsEnabled =
    settings.iperfTcpEnabled || settings.iperfUdpEnabled;
  const validationError = validateIperfSettings(settings);

  // Clear sudo password error when password is entered
  const handlePasswordChange = (value: string) => {
    updateSettings({ sudoerPassword: value });
    if (value && sudoPasswordError) {
      setSudoPasswordError(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowServerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * handleNewImageFile - given the name of a new image file,
   *    get the settings for that floor image
   * @param theFile - name of the new image file
   */
  function handleNewImageFile(theFile: string): void {
    readNewSettingsFromFile(theFile); // tell the parent about the new file
  }

  /**
   * Handle checkbox changes for TCP/UDP tests
   * When enabling tests, clear the server address to force user input
   * When disabling all tests, reset to localhost
   */
  function handleBandwidthCheckboxChange(
    type: "tcp" | "udp",
    checked: boolean,
  ) {
    const newTcpEnabled = type === "tcp" ? checked : settings.iperfTcpEnabled;
    const newUdpEnabled = type === "udp" ? checked : settings.iperfUdpEnabled;
    const anyEnabled = newTcpEnabled || newUdpEnabled;

    if (anyEnabled && settings.iperfServerAdrs === "localhost") {
      // Tests being enabled, clear the server address
      updateSettings({
        iperfTcpEnabled: newTcpEnabled,
        iperfUdpEnabled: newUdpEnabled,
        iperfServerAdrs: "",
      });
    } else if (!anyEnabled) {
      // All tests disabled, reset to localhost
      updateSettings({
        iperfTcpEnabled: newTcpEnabled,
        iperfUdpEnabled: newUdpEnabled,
        iperfServerAdrs: "localhost",
      });
    } else {
      updateSettings({
        iperfTcpEnabled: newTcpEnabled,
        iperfUdpEnabled: newUdpEnabled,
      });
    }
  }

  /**
   * Handle server address selection/input
   * Add to history when a new valid server is entered
   */
  function handleServerChange(value: string) {
    updateSettings({ iperfServerAdrs: value });
  }

  function handleServerSelect(server: string) {
    updateSettings({ iperfServerAdrs: server });
    setShowServerDropdown(false);
  }

  function handleServerBlur() {
    const server = settings.iperfServerAdrs.trim();
    if (
      server &&
      server !== "localhost" &&
      !settings.iperfServerHistory.includes(server)
    ) {
      // Add to history (keep last 10)
      const newHistory = [server, ...settings.iperfServerHistory].slice(0, 10);
      updateSettings({ iperfServerHistory: newHistory });
    }
  }

  return (
    <table className="w-auto">
      <tbody>
        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="Files" className="font-bold text-lg">
              Floor plan&nbsp;
              <PopoverHelper text="Choose a file to be used as a background image, or upload another PNG or JPEG file." />
            </Label>
          </td>
          <td className="max-w-[400px] p-0 m-0">
            <MediaDropdown
              defaultValue={settings.floorplanImageName}
              onChange={(val) => handleNewImageFile(val)}
            />
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4 align-top pt-2">
            <Label htmlFor="bandwidth" className="font-bold text-lg">
              Bandwidth&nbsp;
              <PopoverHelper text="Select which bandwidth tests to run. Requires an iperf3 server." />
            </Label>
          </td>
          <td>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tcpEnabled"
                  checked={settings.iperfTcpEnabled}
                  onCheckedChange={(checked) =>
                    handleBandwidthCheckboxChange("tcp", checked === true)
                  }
                />
                <Label htmlFor="tcpEnabled" className="text-sm cursor-pointer">
                  TCP
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="udpEnabled"
                  checked={settings.iperfUdpEnabled}
                  onCheckedChange={(checked) =>
                    handleBandwidthCheckboxChange("udp", checked === true)
                  }
                />
                <Label htmlFor="udpEnabled" className="text-sm cursor-pointer">
                  UDP
                </Label>
              </div>
            </div>
          </td>
        </tr>

        {bandwidthTestsEnabled && (
          <tr>
            <td className="text-right pr-4">
              <Label htmlFor="iperfServer" className="font-bold text-lg">
                iperf3 Server&nbsp;
                <PopoverHelper text="Address of the iperf3 server (e.g., 192.168.1.100 or hostname:port)" />
              </Label>
            </td>
            <td>
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  className={`w-full border rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400 ${
                    validationError
                      ? "border-red-400 bg-red-50"
                      : "border-gray-200"
                  }`}
                  value={settings.iperfServerAdrs}
                  onChange={(e) => handleServerChange(e.target.value)}
                  onFocus={() =>
                    settings.iperfServerHistory.length > 0 &&
                    setShowServerDropdown(true)
                  }
                  onBlur={handleServerBlur}
                  placeholder="Enter server address..."
                />
                {showServerDropdown &&
                  settings.iperfServerHistory.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-sm shadow-lg max-h-40 overflow-y-auto">
                      {settings.iperfServerHistory.map((server, index) => (
                        <div
                          key={index}
                          className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleServerSelect(server);
                          }}
                        >
                          {server}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
              {validationError && (
                <Alert variant="destructive" className="mt-2 py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
              )}
            </td>
          </tr>
        )}

        {bandwidthTestsEnabled && (
          <tr>
            <td className="text-right pr-4">
              <Label htmlFor="testDuration" className="font-bold text-lg">
                Test Duration&nbsp;
                <PopoverHelper text="Duration of each speed test (in seconds)." />
              </Label>
            </td>
            <td>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
                value={settings.testDuration}
                onChange={(e) =>
                  updateSettings({
                    testDuration: Number(e.target.value.trim()),
                  })
                }
              />
            </td>
          </tr>
        )}

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="sudoPassword" className="font-bold text-lg">
              sudo password&nbsp;
              <PopoverHelper text="Enter the sudo password: required on macOS or Linux." />
            </Label>
          </td>
          <td>
            <PasswordInput
              value={settings.sudoerPassword}
              onChange={handlePasswordChange}
              hasError={sudoPasswordError}
            />
            {sudoPasswordError && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  A sudo password is required to take measurements
                </AlertDescription>
              </Alert>
            )}
          </td>
        </tr>

        <tr>
          <td colSpan={2} className="text-right">
            <HeatmapAdvancedConfig />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
