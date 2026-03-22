import { DefaultTheme, type Theme } from "@react-navigation/native";

import { palette } from "./tokens";

export const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.canvas,
    card: palette.canvas,
    border: palette.stroke,
    text: palette.ink,
    primary: palette.leaf,
    notification: palette.coral
  }
};