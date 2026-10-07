/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React from "react";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";

import { _ } from "../ezyspeech.js";

/* Asks before something that interrupts everyone listening: the action is
 * named on its own button, and Cancel is the easy way out. */
export function Confirm({ isOpen, title, action, isDanger = false, onConfirm, onCancel, children }: {
    isOpen: boolean; title: string; action: string; isDanger?: boolean;
    onConfirm: () => void; onCancel: () => void; children: React.ReactNode;
}) {
    return (
        <Modal variant="small" isOpen={isOpen} onClose={onCancel} aria-labelledby="ezy-confirm-title">
            <ModalHeader title={title} labelId="ezy-confirm-title" {...(isDanger ? { titleIconVariant: "warning" as const } : {})} />
            <ModalBody>{children}</ModalBody>
            <ModalFooter>
                <Button variant={isDanger ? "danger" : "primary"} onClick={onConfirm}>{action}</Button>
                <Button variant="link" onClick={onCancel}>{_("Cancel")}</Button>
            </ModalFooter>
        </Modal>
    );
}
