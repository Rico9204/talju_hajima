import { createRoot } from "react-dom/client";
import { Fixture } from "./workspace-context";
import Workspace from "../../src/components/Workspace";
import "../../src/index.css";
createRoot(document.getElementById("root")!).render(<Fixture><Workspace /></Fixture>);
