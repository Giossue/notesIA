import MaterialDesignIcons from "@react-native-vector-icons/material-design-icons";
import { isValidElement } from "react";
import { knownIconNames, renderIcon } from "@/core/theme/icons";

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));

test("los íconos conocidos usan Lucide y los desconocidos caen a Material", () => {
  for (const name of knownIconNames) {
    const element = renderIcon({ name, size: 24, color: "#111827" });
    expect(isValidElement(element)).toBe(true);
    expect(isValidElement(element) && element.type).not.toBe(MaterialDesignIcons);
  }
  const fallback = renderIcon({ name: "robot-happy", size: 24 });
  expect(isValidElement(fallback) && fallback.type).toBe(MaterialDesignIcons);
});
