import { Redirect } from "expo-router";

export default function PlanIndex() {
  return <Redirect href={"/(app)/(plan)/schedule" as any} />;
}
