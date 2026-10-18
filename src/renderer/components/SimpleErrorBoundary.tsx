/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Card, ErrorBoundary, HeadingTertiary, Paragraph, TextButton } from "@equicord/types/components";
import { FluxDispatcher, InviteActions } from "@equicord/types/webpack/common";
import type { PropsWithChildren } from "react";

async function openSupportChannel() {
    window.open("https://github.com/extoci/excord/issues", "_blank");
}

function Fallback() {
    return (
        <Card variant="danger">
            <HeadingTertiary>Something went wrong.</HeadingTertiary>
            <Paragraph>
                This component failed to render. Report the problem in Excord's{" "}
                <TextButton variant="link" onClick={openSupportChannel}>
                    issue tracker
                </TextButton>
            </Paragraph>
        </Card>
    );
}

export function SimpleErrorBoundary({ children }: PropsWithChildren<{}>) {
    return <ErrorBoundary fallback={Fallback}>{children}</ErrorBoundary>;
}
