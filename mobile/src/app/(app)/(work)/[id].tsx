import { useLocalSearchParams } from "expo-router";
import { Placeholder } from "@/components/Placeholder";

export default function BacklogItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Placeholder
      title="Task Details"
      subtitle={`Editing task ${id ?? ""}.`}
    />
  );
}
