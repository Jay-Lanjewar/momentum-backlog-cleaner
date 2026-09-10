import { Redirect } from "expo-router";

export default function SocialIndex() {
  return <Redirect href={"/(app)/(social)/friends" as any} />;
}
