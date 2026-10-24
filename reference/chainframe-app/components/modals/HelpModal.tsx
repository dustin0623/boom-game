"use client";

import {
  SocialActionModal,
  type SocialActionModalProps,
} from "@/components/modals/SocialActionModal";

/** Use a Help item on the target. Enabled only while the target is sabotaged; the server re-validates. */
export function HelpModal(props: SocialActionModalProps) {
  return <SocialActionModal kind="help" {...props} />;
}
