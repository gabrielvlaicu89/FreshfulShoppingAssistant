import type React from "react";

import "@testing-library/jest-native/extend-expect";
import { act, cleanup } from "@testing-library/react-native";
import { notifyManager } from "@tanstack/react-query";

const activeTimeouts = new Set<ReturnType<typeof global.setTimeout>>();
const activeIntervals = new Set<ReturnType<typeof global.setInterval>>();
const activeImmediates = new Set<ReturnType<typeof global.setImmediate>>();

const originalSetTimeout = global.setTimeout.bind(global);
const originalClearTimeout = global.clearTimeout.bind(global);
const originalSetInterval = global.setInterval.bind(global);
const originalClearInterval = global.clearInterval.bind(global);
const originalSetImmediate = global.setImmediate.bind(global);
const originalClearImmediate = global.clearImmediate.bind(global);

global.setTimeout = ((callback: (...args: Array<unknown>) => void, delay?: number, ...args: Array<unknown>) => {
  const timeoutHandle = originalSetTimeout(() => {
    activeTimeouts.delete(timeoutHandle);
    callback(...args);
  }, delay);

  activeTimeouts.add(timeoutHandle);

  return timeoutHandle;
}) as typeof global.setTimeout;

global.clearTimeout = ((timeoutHandle: ReturnType<typeof global.setTimeout>) => {
  activeTimeouts.delete(timeoutHandle);

  return originalClearTimeout(timeoutHandle);
}) as typeof global.clearTimeout;

global.setInterval = ((callback: (...args: Array<unknown>) => void, delay?: number, ...args: Array<unknown>) => {
  const intervalHandle = originalSetInterval(() => {
    callback(...args);
  }, delay);

  activeIntervals.add(intervalHandle);

  return intervalHandle;
}) as typeof global.setInterval;

global.clearInterval = ((intervalHandle: ReturnType<typeof global.setInterval>) => {
  activeIntervals.delete(intervalHandle);

  return originalClearInterval(intervalHandle);
}) as typeof global.clearInterval;

global.setImmediate = ((callback: (...args: Array<unknown>) => void, ...args: Array<unknown>) => {
  const immediateHandle = originalSetImmediate(() => {
    activeImmediates.delete(immediateHandle);
    callback(...args);
  });

  activeImmediates.add(immediateHandle);

  return immediateHandle;
}) as typeof global.setImmediate;

global.clearImmediate = ((immediateHandle: ReturnType<typeof global.setImmediate>) => {
  activeImmediates.delete(immediateHandle);

  return originalClearImmediate(immediateHandle);
}) as typeof global.clearImmediate;

afterEach(() => {
  cleanup();

  for (const timeoutHandle of activeTimeouts) {
    originalClearTimeout(timeoutHandle);
  }
  activeTimeouts.clear();

  for (const intervalHandle of activeIntervals) {
    originalClearInterval(intervalHandle);
  }
  activeIntervals.clear();

  for (const immediateHandle of activeImmediates) {
    originalClearImmediate(immediateHandle);
  }
  activeImmediates.clear();
});

notifyManager.setNotifyFunction((callback) => {
  act(() => {
    callback();
  });
});

notifyManager.setBatchNotifyFunction((callback) => {
  act(() => {
    callback();
  });
});

notifyManager.setScheduler((callback) => {
  callback();
});

jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 360, height: 800 };
  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);

  return {
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        SafeAreaInsetsContext.Provider,
        { value: insets },
        React.createElement(SafeAreaFrameContext.Provider, { value: frame }, children)
      ),
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    initialWindowMetrics: {
      frame,
      insets
    },
    useSafeAreaInsets: () => React.useContext(SafeAreaInsetsContext),
    useSafeAreaFrame: () => React.useContext(SafeAreaFrameContext)
  };
});

jest.mock("react-native-screens", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");

  const createWrapper = ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children);

  return {
    enableScreens: jest.fn(),
    screensEnabled: jest.fn(() => false),
    Screen: createWrapper,
    ScreenContainer: createWrapper,
    NativeScreen: createWrapper,
    NativeScreenContainer: createWrapper,
    ScreenStack: createWrapper,
    ScreenStackItem: createWrapper,
    FullWindowOverlay: createWrapper,
    SearchBar: () => null,
    executeNativeBackPress: jest.fn()
  };
});

jest.mock("@react-navigation/native-stack", () => {
  const React = jest.requireActual<typeof import("react")>("react");

  function toObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  }

  return {
    createNativeStackNavigator: () => {
      function Navigator({ children, initialRouteName }: { children?: React.ReactNode; initialRouteName?: string }) {
        const screens = React.Children.toArray(children).filter(Boolean) as Array<{
          props: {
            name: string;
            component: React.ComponentType<unknown>;
          };
        }>;
        const initialScreenName = initialRouteName ?? screens[0]?.props.name;
        const [routeState, setRouteState] = React.useState<{
          name: string;
          params: unknown;
        }>({
          name: initialScreenName,
          params: undefined
        });
        const activeScreen = screens.find((screen) => screen.props.name === routeState.name) ?? screens[0];
        const ScreenComponent = activeScreen.props.component as React.ComponentType<{
          navigation: {
            navigate: (nextRouteName: string | { name: string; params?: unknown; merge?: boolean }) => void;
            replace: (nextRouteName: string | { name: string; params?: unknown }) => void;
          };
          route: {
            key: string | undefined;
            name: string | undefined;
            params: unknown;
          };
        }>;
        const navigation = {
          navigate: (nextRouteName: string | { name: string; params?: unknown; merge?: boolean }) => {
            if (typeof nextRouteName === "string") {
              setRouteState({ name: nextRouteName, params: undefined });
              return;
            }

            setRouteState((currentState) => ({
              name: nextRouteName.name,
              params:
                nextRouteName.merge && currentState.name === nextRouteName.name
                  ? { ...toObjectRecord(currentState.params), ...toObjectRecord(nextRouteName.params) }
                  : nextRouteName.params
            }));
          },
          replace: (nextRouteName: string | { name: string; params?: unknown }) => {
            if (typeof nextRouteName === "string") {
              setRouteState({ name: nextRouteName, params: undefined });
              return;
            }

            setRouteState({ name: nextRouteName.name, params: nextRouteName.params });
          }
        };

        return React.createElement(ScreenComponent, {
          navigation,
          route: {
            key: routeState.name,
            name: routeState.name,
            params: routeState.params
          }
        });
      }

      function Screen() {
        return null;
      }

      return {
        Navigator,
        Screen
      };
    }
  };
});

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn()
  }
}));

jest.mock("react-native-keychain", () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn()
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
}));