"use client";
import { useState, useEffect } from "react";
import * as Toast from "@radix-ui/react-toast";

interface SSEData {
  status: string;
  type: string;
  header: string;
  tcpEnabled?: boolean;
  udpEnabled?: boolean;
  progress?: number;
}

interface NewToastProps {
  onClose: () => void;
  toastIsReady: () => void;
}
export default function NewToast({ onClose, toastIsReady }: NewToastProps) {
  const [toastHeader, setToastHeader] = useState("");
  const [toastStatus, setToastStatus] = useState("");
  const [taskRunning, setTaskRunning] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource("/api/events"); // issue GET to open connection to the SSE server

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: SSEData = JSON.parse(event.data);

        if (data.type === "ready") {
          toastIsReady();
          return;
        }
        if (data.type === "update") {
          // just an update
          setToastHeader(data.header);
          setToastStatus(data.status);
          // Update progress if provided and tests are enabled
          if (
            data.progress !== undefined &&
            (data.tcpEnabled || data.udpEnabled)
          ) {
            setProgress(data.progress);
            setShowProgress(true);
          }
        }

        if (data.type == "done") {
          // we're done (complete, error, canceled)
          setToastHeader(data.header);
          setToastStatus(data.status);
          setProgress(100);
          eventSource.close();
          setTimeout(() => {
            setTaskRunning(false);
            onClose();
          }, 3000);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error: Event) => {
      console.error("SSE error:", error);
      eventSource.close();
    };

    // Handle browser reload/unload
    const handleUnload = () => {
      eventSource.close(); // cleanly closes connection
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("unload", handleUnload);

    return () => {
      eventSource.close();
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("unload", handleUnload);
    };
  }, []);

  const handleCancel = async () => {
    // tell the server to stop doing work
    await fetch("/api/start-task?action=stop", { method: "POST" });
    setToastStatus("Task Canceled ❌");
    setToastHeader("Canceled");
    setTaskRunning(false);
    setTimeout(() => onClose(), 3000);
  };

  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        className="fixed bottom-[10px] right-[5px] w-96 bg-gray-200 text-gray-800 p-4 rounded shadow-md"
        duration={Infinity} // Keeps open until manually closed
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Toast.Title className="font-bold">{toastHeader}</Toast.Title>
            {/* Convert \n into actual <br /> elements */}
            <Toast.Description className="text-sm text-gray-800 leading-relaxed">
              {toastStatus.split("\n").map((line, index) => (
                <span key={index}>
                  <div>{line}</div>
                </span>
              ))}
            </Toast.Description>
          </div>
          {taskRunning && (
            <button
              onClick={handleCancel}
              className="bg-red-500 text-white px-2 py-1 rounded text-sm ml-2"
            >
              Cancel
            </button>
          )}
        </div>
        {/* Progress bar */}
        {showProgress && (
          <div className="mt-3">
            <div className="w-full bg-gray-300 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-gray-600 mt-1 text-right">
              {progress}%
            </div>
          </div>
        )}
      </Toast.Root>

      <Toast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-64" />
    </Toast.Provider>
  );
}
