import type React from "react";

import "@testing-library/jest-native/extend-expect";
import { act } from "@testing-library/react-native";
import { notifyManager } from "@tanstack/react-query";

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
        const [routeName, setRouteName] = React.useState(initialScreenName);
        const activeScreen = screens.find((screen) => screen.props.name === routeName) ?? screens[0];
        const ScreenComponent = activeScreen.props.component as React.ComponentType<{
          navigation: {
            navigate: (nextRouteName: string) => void;
            replace: (nextRouteName: string) => void;
          };
          route: {
            key: string | undefined;
            name: string | undefined;
            params: undefined;
          };
        }>;
        const navigation = {
          navigate: (nextRouteName: string) => setRouteName(nextRouteName),
          replace: (nextRouteName: string) => setRouteName(nextRouteName)
        };

        return React.createElement(ScreenComponent, {
          navigation,
          route: {
            key: routeName,
            name: routeName,
            params: undefined
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