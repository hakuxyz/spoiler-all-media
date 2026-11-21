import { Dispatcher } from '@valenced/discord/common/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { findInReactFiber, useReRender } from '@valenced/utils/react'
import { Text, TouchableOpacity } from 'react-native'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'

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

const patched = new Set<unknown>()

let uploadStore: UploadStore | undefined
let channelStore: ChannelStore | undefined

function uploadsFor(channelId: string): Upload[] {
	const files = uploadStore?.getUploads?.(channelId, 0) ?? []
	console.log('[SpoilerAllMedia] uploadsFor', channelId, files.length)
	return files
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

function SpoilerAllButton({ channelId }: { channelId: string }) {
	const rerender = useReRender()
	const files = uploadsFor(channelId)
	console.log('[SpoilerAllMedia] button render', channelId, files.length)

	if (files.length === 0) return null

	return (
		<TouchableOpacity
			accessibilityLabel="Spoiler all media"
			onPress={() => {
				markAll(channelId, files)
				rerender()
			}}
			style={{
				backgroundColor: '#5865F2',
				paddingHorizontal: 8,
				paddingVertical: 6,
				borderRadius: 8,
				marginHorizontal: 4,
			}}
		>
			<Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' }}>
				👁 Spoiler all
			</Text>
		</TouchableOpacity>
	)
}

function insertButton(tree: ReactElement): ReactElement {
	const node = findInReactFiber(
		tree,
		(node): node is { props: { children: ReactNode[] } } =>
			Array.isArray(node.props?.children),
	)
	if (!node) return tree

	const channelNode = findInReactFiber(
		tree,
		(node): node is { props: { channel?: { id?: string } } } =>
			typeof node.props?.channel?.id === 'string',
	)
	const channelId =
		channelNode?.props.channel?.id ?? channelStore?.getChannelId?.()
	console.log('[SpoilerAllMedia] insert', {
		source: channelNode ? 'fiber' : 'store',
		channelId,
		children: node.props.children.length,
	})
	if (!channelId) return tree

	const children = node.props.children
	const index = children.findIndex(
		child => (child as ReactElement | null)?.key === 'spoiler-all-media',
	)
	if (index !== -1) children.splice(index, 1)
	children.push(
		<SpoilerAllButton key="spoiler-all-media" channelId={channelId} />,
	)
	return tree
}

function patchActions<T extends { default: MemoExoticComponent<FC> }>(
	path: string,
	cleanup: (...fns: Array<() => unknown>) => void,
): void {
	cleanup(
		getModuleWithImportedPath<T>(path, ({ default: Actions }) => {
			console.log('[SpoilerAllMedia] actions found', path, !!Actions)
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
		console.log('[SpoilerAllMedia] start')
		cleanup(
			getModules(
				withProps('getUploads'),
				exports => {
					if (!uploadStore && typeof exports?.getUploads === 'function') {
						uploadStore = exports
						console.log('[SpoilerAllMedia] uploadStore found')
					}
				},
				{ max: 5 },
			),
			getModules(
				withProps('getChannelId'),
				exports => {
					if (!channelStore && typeof exports?.getChannelId === 'function') {
						channelStore = exports
						console.log('[SpoilerAllMedia] channelStore found')
					}
				},
				{ max: 5 },
			),
			() => {
				console.log('[SpoilerAllMedia] stores', !!uploadStore, !!channelStore)
			},
			() => {
				uploadStore = undefined
				channelStore = undefined
			},
		)

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
