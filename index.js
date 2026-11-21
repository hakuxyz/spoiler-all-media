(() => {
    const api = window.vendetta || window.bunny || window.revenge || window.enmity;
    if (!api) {
        console.error("[SpoilerAllMedia] Client API not found!");
        return;
    }

    const { metro, patcher, ui, commands } = api;
    const { findByProps, findByName } = metro;
    const { after } = patcher;
    const { showToast } = ui.toasts;
    const { getAssetIDByName } = ui.assets;
    const React = metro.common.React;
    const ReactNative = metro.common.ReactNative;

    const UploadStore = findByProps("getUploads");
    const UploadManager = findByProps("setFile", "clearAll");
    const SelectedChannelStore = findByProps("getChannelId");
    const ChatInput = findByName("ChatInput", false) || findByProps("ChatInput");

    let patches = [];
    let unregisterCmd = null;

    function markAllAsSpoiler(channelId) {
        const targetChannel = channelId || SelectedChannelStore?.getChannelId?.();
        if (!targetChannel || !UploadStore) return 0;

        const uploads = UploadStore.getUploads(targetChannel, 0);
        if (!uploads || uploads.length === 0) return 0;

        let changedCount = 0;

        uploads.forEach((file) => {
            if (!file) return;
            if (file.filename && !file.filename.startsWith("SPOILER_")) {
                file.filename = "SPOILER_" + file.filename;
                file.spoiler = true;
                changedCount++;
            } else if (!file.spoiler) {
                file.spoiler = true;
                changedCount++;
            }
        });

        if (changedCount > 0 && UploadManager?.setUploads) {
            UploadManager.setUploads({
                channelId: targetChannel,
                uploads: [...uploads],
                draftType: 0
            });
        } else if (changedCount > 0 && UploadStore?.emitChange) {
            UploadStore.emitChange();
        }

        return changedCount;
    }

    function SpoilerAllButton({ channelId }) {
        const [, setTick] = React.useState(0);
        const uploads = UploadStore?.getUploads?.(channelId, 0) || [];

        if (uploads.length === 0) return null;

        const allSpoilers = uploads.every(
            (f) => f?.spoiler || f?.filename?.startsWith("SPOILER_")
        );

        const handlePress = () => {
            const count = markAllAsSpoiler(channelId);
            setTick((t) => t + 1);
            if (count > 0) {
                showToast(
                    `Marked ${count} attachment(s) as spoiler!`,
                    getAssetIDByName("ic_eye_slash") || getAssetIDByName("Check")
                );
            } else {
                showToast("All attachments are already spoilers.", getAssetIDByName("Small"));
            }
        };

        return React.createElement(
            ReactNative.TouchableOpacity,
            {
                onPress: handlePress,
                style: {
                    backgroundColor: allSpoilers ? "#43b581" : "#5865F2",
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    marginHorizontal: 6,
                    marginBottom: 4,
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center"
                }
            },
            React.createElement(
                ReactNative.Text,
                {
                    style: {
                        color: "#FFFFFF",
                        fontWeight: "bold",
                        fontSize: 12
                    }
                },
                allSpoilers ? "✓ All spoiled" : `👁 Spoiler all (${uploads.length})`
            )
        );
    }

    const plugin = {
        onLoad() {
            if (ChatInput?.default) {
                patches.push(
                    after("default", ChatInput, (args, res) => {
                        try {
                            const channelId =
                                args?.[0]?.channel?.id || SelectedChannelStore?.getChannelId?.();
                            if (!channelId || !res) return res;

                            return React.createElement(
                                ReactNative.View,
                                { style: { flexDirection: "column", width: "100%" } },
                                React.createElement(SpoilerAllButton, { channelId }),
                                res
                            );
                        } catch (e) {
                            return res;
                        }
                    })
                );
            }

            if (commands?.registerCommand) {
                unregisterCmd = commands.registerCommand({
                    name: "spoilerall",
                    displayName: "spoilerall",
                    description: "Spoiler all media attachments in the current message with one action",
                    displayDescription: "Spoiler all media attachments in the current message with one action",
                    options: [],
                    applicationId: "-1",
                    inputType: 1,
                    type: 1,
                    execute: (_, ctx) => {
                        const count = markAllAsSpoiler(ctx?.channel?.id);
                        if (count > 0) {
                            showToast(
                                `Marked ${count} attachment(s) as spoiler!`,
                                getAssetIDByName("Check")
                            );
                        } else {
                            showToast("No unspoiled attachments found.", getAssetIDByName("Small"));
                        }
                    }
                });
            }
        },

        onUnload() {
            patches.forEach((unpatch) => unpatch && unpatch());
            patches = [];
            if (unregisterCmd) unregisterCmd();
        }
    };

    return plugin;
})();
