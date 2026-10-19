/** Small icons for element types and action types (outliner, lists, properties). */
import type { Action, Element } from "@anivo/schema";
import {
  ArrowEnter16Regular,
  ArrowExit16Regular,
  ArrowRight16Regular,
  Circle16Regular,
  Code16Regular,
  Diamond16Regular,
  Directions16Regular,
  Emoji16Regular,
  Flow16Regular,
  Image16Regular,
  LineHorizontal116Regular,
  NumberSymbol16Regular,
  ShapeUnion16Regular,
  Sparkle16Regular,
  Square16Regular,
  Stack16Regular,
  Table16Regular,
  TextT16Regular,
  Timer16Regular,
  Video16Regular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";

export function elementIcon(type: Element["type"]): ReactElement {
  switch (type) {
    case "rectangle":
      return <Square16Regular />;
    case "ellipse":
      return <Circle16Regular />;
    case "diamond":
      return <Diamond16Regular />;
    case "line":
      return <LineHorizontal116Regular />;
    case "connector":
      return <ArrowRight16Regular />;
    case "text":
      return <TextT16Regular />;
    case "icon":
      return <Emoji16Regular />;
    case "image":
      return <Image16Regular />;
    case "table":
      return <Table16Regular />;
    case "code":
      return <Code16Regular />;
    case "group":
      return <Stack16Regular />;
    default:
      return <Square16Regular />;
  }
}

export function actionIcon(type: Action["type"]): ReactElement {
  switch (type) {
    case "enter":
      return <ArrowEnter16Regular />;
    case "exit":
      return <ArrowExit16Regular />;
    case "emphasis":
      return <Sparkle16Regular />;
    case "morph":
      return <ShapeUnion16Regular />;
    case "flow":
      return <Flow16Regular />;
    case "camera":
      return <Video16Regular />;
    case "counter":
      return <NumberSymbol16Regular />;
    case "code":
      return <Code16Regular />;
    case "motion":
      return <Directions16Regular />;
    default:
      return <Timer16Regular />;
  }
}
