import { createFileRoute } from "@tanstack/react-router";
import { ChainIQApp } from "@/chainiq-entry";

export const Route = createFileRoute("/$")({
  component: ChainIQApp,
});
