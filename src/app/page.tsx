"use client";

import { SettingsProvider } from "@/components/GlobalSettings";
import TabPanel from "@/components/TabPanel";
export default function App() {
  return (
    <SettingsProvider>
      <TabPanel />
    </SettingsProvider>
  );
}
