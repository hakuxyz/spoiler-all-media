import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { findInReactFiber, useReRender } from '@valenced/utils/react'
import { useEffect, useState } from 'react'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'
import type { ImageStyle, StyleProp } from 'react-native'

type Upload = {
	filename: string
	spoiler?: boolean
}

type UploadStore = {
	getUploads?: (channelId: string, draftType: number) => Upload[]
}

type ChannelStore = {
	getChannelId?: () => string | undefined
}

type ActionButtonProps = {
	accessibilityLabel: string
	IconComponent: FC<{ style: StyleProp<ImageStyle> }>
	onPress(): void
}

type ActionButtonModule = {
	default: FC<ActionButtonProps>
}

const ChatInputActionButtonPath =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'

const patched = new Set<unknown>()

const uploadStore = Stores.UploadAttachmentStore as unknown as UploadStore
const channelStore = Stores.SelectedChannelStore as unknown as ChannelStore

const Icon = lookupGeneratedIconComponent(
	'EyeSlashIcon',
	'EyeIcon',
	'ImageIcon',
)

function uploadsFor(channelId: string): Upload[] {
	return uploadStore?.getUploads?.(channelId, 0) ?? []
}

function markAll(channelId: string, files: Upload[]): void {
	Dispatcher.dispatch({
		type: 'UPLOAD_ATTACHMENT_SET_UPLOADS',
		channelId,
		draftType: 0,
		uploads: files.map(file => ({
			...file,
			filename: file.filename?.startsWith('SPOILER_')
				? file.filename
				: `SPOILER_${file.filename}`,
			spoiler: true,
		})),
	})
}

function SpoilerAllButton() {
	const rerender = useReRender()
	const [ActionButton, setActionButton] = useState(
		() =>
			lookupModuleWithImportedPath<ActionButtonModule>(
				ChatInputActionButtonPath,
			)[0]?.default,
	)

	useEffect(() => {
		if (ActionButton) return
		return getModuleWithImportedPath<ActionButtonModule>(
			ChatInputActionButtonPath,
			({ default: Button }) => setActionButton(() => Button),
		)
	}, [ActionButton])

	const channelId = channelStore?.getChannelId?.()
	const files = channelId ? uploadsFor(channelId) : []

	if (!ActionButton || !Icon || !channelId || files.length === 0) return null

	return (
		<ActionButton
			accessibilityLabel="Spoiler all media"
			IconComponent={Icon}
			onPress={() => {
				markAll(channelId, files)
				rerender()
			}}
		/>
	)
}

const button = <SpoilerAllButton key="spoiler-all-media" />

function insertButton(tree: ReactElement): ReactElement {
	const node = findInReactFiber(
		tree,
		(node): node is { props: { children: ReactNode[] } } =>
			Array.isArray(node.props?.children),
	)
	if (!node) return tree

	const children = node.props.children
	const index = children.indexOf(button)
	if (index !== -1) children.splice(index, 1)
	children.push(button)
	return tree
}

function patchActions<T extends { default: MemoExoticComponent<FC> }>(
	path: string,
	cleanup: (...fns: Array<() => unknown>) => void,
): void {
	cleanup(
		getModuleWithImportedPath<T>(path, ({ default: Actions }) => {
			if (patched.has(Actions)) return
			patched.add(Actions)
			cleanup(
				after(Actions, 'type', tree => insertButton(tree as ReactElement)),
				() => patched.delete(Actions),
			)
		}),
	)
}

export default plugin({
	start({ cleanup }) {
		patchActions<{ default: MemoExoticComponent<FC> }>(
			'modules/chat_input/native/action_buttons/ChatInputActions.tsx',
			cleanup,
		)
		patchActions<{ default: MemoExoticComponent<FC> }>(
			'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx',
			cleanup,
		)
		cleanup(() => patched.clear())
	},
})
