import { useUIStore } from "../../stores";
import AlertDialog from "./AlertDialog";

export default function GlobalAlertModal() {
  const alertModal = useUIStore((s) => s.alertModal);
  const closeAlertModal = useUIStore((s) => s.closeAlertModal);

  return (
    <AlertDialog
      isOpen={alertModal !== null}
      title={alertModal?.title ?? "Alerte"}
      message={alertModal?.message ?? ""}
      criteria={alertModal?.criteria}
      confirmLabel={alertModal?.confirmLabel ?? "J'ai compris"}
      onConfirm={closeAlertModal}
      onClose={closeAlertModal}
    />
  );
}
