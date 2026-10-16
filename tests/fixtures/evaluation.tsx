import { createRoot } from "react-dom/client";
import { Fixture } from "./evaluation-context";
import PeerEvaluation from "../../src/components/PeerEvaluation";
import "../../src/index.css";
createRoot(document.getElementById("root")!).render(<Fixture><PeerEvaluation /></Fixture>);
