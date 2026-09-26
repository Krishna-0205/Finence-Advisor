import { createFileRoute } from "@tanstack/react-router";
import { Governance } from "../pages/governance";

export const Route = createFileRoute("/_app/governance")({
  component: Governance,
});
