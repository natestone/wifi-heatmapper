import * as Tabs from "@radix-ui/react-tabs";
import { useState, useRef, useEffect } from "react";
import { useSettings, validateIperfSettings } from "./GlobalSettings";
import { Menu, X } from "lucide-react";

import SettingsEditor from "@/components/SettingsEditor";
import ClickableFloorplan from "@/components/Floorplan";
import { Heatmaps } from "@/components/Heatmaps";
import PointsTable from "@/components/PointsTable";

export default function TabPanel() {
  const [activeTab, setActiveTab] = useState("tab1"); // Default to Floor Plan
  const {
    settings,
    surveyPointActions,
    settingsMenuOpen,
    setSettingsMenuOpen,
  } = useSettings();
  const menuRef = useRef<HTMLDivElement>(null);

  const validationError = validateIperfSettings(settings);
  const hasValidationError = validationError !== "";

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Only close if there's no validation error
        if (!hasValidationError) {
          setSettingsMenuOpen(false);
        }
      }
    }
    if (settingsMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [settingsMenuOpen, hasValidationError, setSettingsMenuOpen]);

  // Handle tab change - block if there's a validation error
  const handleTabChange = (newTab: string) => {
    if (hasValidationError) {
      // Don't allow switching tabs when there's a validation error
      setSettingsMenuOpen(true);
      return;
    }
    setActiveTab(newTab);
  };

  // Toggle settings menu
  const toggleSettingsMenu = () => {
    // If closing and there's a validation error, don't allow
    if (settingsMenuOpen && hasValidationError) {
      return;
    }
    setSettingsMenuOpen(!settingsMenuOpen);
  };

  // Get tab trigger classes based on whether it's disabled
  const getTabTriggerClass = (isDisabled: boolean) => {
    const baseClass =
      "px-4 py-2.5 text-base font-medium border border-gray-400 border-b-0 rounded-t-md transition-all duration-300 ease-in-out";
    const activeClass =
      "data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=active]:border-gray-500";

    if (isDisabled) {
      return `${baseClass} bg-gray-200 text-gray-400 cursor-not-allowed ${activeClass}`;
    }
    return `${baseClass} bg-gray-300 text-gray-800 cursor-pointer hover:bg-gray-200 ${activeClass}`;
  };

  return (
    <div className="w-full p-2 relative">
      {/* Tabs Root with controlled state */}
      <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
        {/* Tab List with hamburger menu */}
        <Tabs.List className="flex gap-2 pt-1 items-center">
          {/* Hamburger menu button */}
          <button
            onClick={toggleSettingsMenu}
            className={`p-2.5 rounded-md border border-gray-400 transition-all duration-300 ease-in-out ${
              settingsMenuOpen
                ? "bg-white text-black"
                : "bg-gray-300 text-gray-800 hover:bg-gray-200"
            }`}
            title="Settings"
          >
            {settingsMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <Tabs.Trigger
            value="tab1"
            data-radix-collection-item
            className={getTabTriggerClass(hasValidationError)}
            disabled={hasValidationError}
          >
            Floor&nbsp;Plan
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab2"
            data-radix-collection-item
            className={getTabTriggerClass(hasValidationError)}
            disabled={hasValidationError}
          >
            Heat&nbsp;Maps
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tab3"
            data-radix-collection-item
            className={getTabTriggerClass(hasValidationError)}
            disabled={hasValidationError}
          >
            Survey&nbsp;Points
          </Tabs.Trigger>
        </Tabs.List>

        {/* Settings Panel Overlay */}
        {settingsMenuOpen && (
          <div
            ref={menuRef}
            className="absolute top-14 left-2 z-50 bg-white border border-gray-300 rounded-lg shadow-xl p-4 max-w-lg"
          >
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <h3 className="text-lg font-semibold text-gray-800">Settings</h3>
              {!hasValidationError && (
                <button
                  onClick={() => setSettingsMenuOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <SettingsEditor />
          </div>
        )}

        {/* Tab Content */}
        <Tabs.Content value="tab1" className="p-4">
          <ClickableFloorplan />
        </Tabs.Content>

        <Tabs.Content value="tab2" className="p-4">
          <Heatmaps />
        </Tabs.Content>

        <Tabs.Content value="tab3" className="p-4">
          <PointsTable
            data={settings.surveyPoints}
            surveyPointActions={surveyPointActions}
            apMapping={settings.apMapping}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
