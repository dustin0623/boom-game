"use client";

import {
  SocialActionModal,
  type SocialActionModalProps,
} from "@/components/modals/SocialActionModal";

/** Select an owned Sabotage item and use it on the target. Disabled with a Shop link when none are owned. */
export function SabotageModal(props: SocialActionModalProps) {
  return <SocialActionModal kind="sabotage" {...props} />;
}
