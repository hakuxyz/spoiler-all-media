import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { Children, cloneElement, createElement, useReducer } from 'react'
import { Text, TouchableOpacity } from 'react-native'
import type { ElementType, ReactElement } from 'react'

type Upload = {
	filename: string
	spoiler?: boolean
}

type UploadStore = {
	getUploads?: (channelId: string, draftType: number) => Upload[] | undefined
	emitChange?: () => void
}

type ChannelStore = {
	getChannelId?: () => string | undefined
}

type Cleanup = (...fns: Array<() => unknown>) => void

const ACTION_COMPONENTS = ['ChatInputActions', 'ChatInputRightActions']

const patched = new Set<ElementType>()

let uploadStore: UploadStore | undefined
let channelStore: ChannelStore | undefined

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null
}

function componentName(value: any): string | undefined {
	return value?.displayName ?? value?.name
}

function resolveComponent(exports: any, name: string): any {
	if (!isRecord(exports) && typeof exports !== 'function') return undefined

	const candidates = [
		exports?.[name]?.type,
		exports?.default?.[name]?.type,
		exports?.default?.type,
		exports?.[name],
		exports?.default?.[name],
		exports?.default,
		exports,
	]

	for (const candidate of candidates) {
		if (componentName(candidate) === name) return candidate
	}
	return undefined
}

const withComponentName = createFilterGenerator<[name: string]>(
	([name], _id, exports) => {
		try {
			return Boolean(resolveComponent(exports, name))
		} catch {
			return false
		}
	},
	([name]) => `spoilerAllMedia.componentName(${name})`,
	FilterScopes.Initialized,
)

function markAll(channelId: string): void {
	const files = uploadStore?.getUploads?.(channelId, 0) ?? []
	for (const file of files) {
		if (!file) continue
		if (!file.filename?.startsWith('SPOILER_')) {
			file.filename = `SPOILER_${file.filename}`
		}
		file.spoiler = true
	}
	if (typeof uploadStore?.emitChange === 'function') uploadStore.emitChange()
}

function SpoilerAllButton({ channelId }: { channelId: string }) {
	const [, rerender] = useReducer((value: number) => value + 1, 0)
	const files = uploadStore?.getUploads?.(channelId, 0) ?? []

	if (files.length === 0) return null

	const allSpoilers = files.every(
		file => file?.spoiler === true || file?.filename?.startsWith('SPOILER_'),
	)

	return createElement(
		TouchableOpacity,
		{
			onPress: () => {
				markAll(channelId)
				rerender()
			},
			style: {
				backgroundColor: allSpoilers ? '#43b581' : '#5865F2',
				paddingHorizontal: 10,
				paddingVertical: 6,
				borderRadius: 16,
				marginHorizontal: 6,
			},
		},
		createElement(
			Text,
			{ style: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' } },
			allSpoilers ? 'All spoiled' : `Spoiler all (${files.length})`,
		),
	)
}

function install(exports: any, name: string, cleanup: Cleanup): void {
	const component = resolveComponent(exports, name)
	if (!component || patched.has(component)) return
	patched.add(component)

	const unpatch = afterJSX(component as ElementType, element => {
		try {
			const el = element as ReactElement<Record<string, unknown>>
			const props = el.props ?? {}
			const channelId = channelStore?.getChannelId?.()
			if (!channelId) return element as never

			const children = Children.toArray(props.children as any)
			return cloneElement(el, {
				...props,
				children: [...children, createElement(SpoilerAllButton, { channelId })],
			} as any) as never
		} catch {
			return element as never
		}
	})

	cleanup(() => {
		patched.delete(component)
		unpatch()
	})
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			getModules(
				withProps('getUploads'),
				exports => {
					if (!uploadStore && typeof exports?.getUploads === 'function') {
						uploadStore = exports
					}
				},
				{ max: 5 },
			),
		)

		cleanup(
			getModules(
				withProps('getChannelId'),
				exports => {
					if (!channelStore && typeof exports?.getChannelId === 'function') {
						channelStore = exports
					}
				},
				{ max: 5 },
			),
		)

		cleanup(() => {
			uploadStore = undefined
			channelStore = undefined
		})

		for (const name of ACTION_COMPONENTS) {
			cleanup(
				getModules(
					withComponentName(name),
					exports => install(exports, name, cleanup),
					{ max: 5 },
				),
			)
		}
	},
})
