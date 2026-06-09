// Thin React wrappers around the @material/web (Lit) custom elements.
// Importing each element module registers its custom element; createComponent
// from @lit/react maps React props to element properties and custom events to
// onX props (needed even on React 19 for clean event/property handling).
import * as React from 'react'
import { createComponent } from '@lit/react'

import { MdIconButton } from '@material/web/iconbutton/icon-button.js'
import { MdFilledButton } from '@material/web/button/filled-button.js'
import { MdTextButton } from '@material/web/button/text-button.js'
import { MdFilledTonalButton } from '@material/web/button/filled-tonal-button.js'
import { MdFab } from '@material/web/fab/fab.js'
import { MdList } from '@material/web/list/list.js'
import { MdListItem } from '@material/web/list/list-item.js'
import { MdMenu } from '@material/web/menu/menu.js'
import { MdMenuItem } from '@material/web/menu/menu-item.js'
import { MdDivider } from '@material/web/divider/divider.js'
import { MdDialog } from '@material/web/dialog/dialog.js'
import { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js'
import { MdRipple } from '@material/web/ripple/ripple.js'
import { MdFocusRing } from '@material/web/focus/md-focus-ring.js'

export const IconButton = createComponent({
  react: React,
  tagName: 'md-icon-button',
  elementClass: MdIconButton,
})

export const FilledButton = createComponent({
  react: React,
  tagName: 'md-filled-button',
  elementClass: MdFilledButton,
})

export const TextButton = createComponent({
  react: React,
  tagName: 'md-text-button',
  elementClass: MdTextButton,
})

export const FilledTonalButton = createComponent({
  react: React,
  tagName: 'md-filled-tonal-button',
  elementClass: MdFilledTonalButton,
})

export const Fab = createComponent({
  react: React,
  tagName: 'md-fab',
  elementClass: MdFab,
})

export const List = createComponent({
  react: React,
  tagName: 'md-list',
  elementClass: MdList,
})

export const ListItem = createComponent({
  react: React,
  tagName: 'md-list-item',
  elementClass: MdListItem,
})

export const Menu = createComponent({
  react: React,
  tagName: 'md-menu',
  elementClass: MdMenu,
  events: { onOpened: 'opened', onClosed: 'closed' },
})

export const MenuItem = createComponent({
  react: React,
  tagName: 'md-menu-item',
  elementClass: MdMenuItem,
})

export const Divider = createComponent({
  react: React,
  tagName: 'md-divider',
  elementClass: MdDivider,
})

export const Dialog = createComponent({
  react: React,
  tagName: 'md-dialog',
  elementClass: MdDialog,
  events: { onClose: 'close', onClosed: 'closed', onCancel: 'cancel' },
})

export const OutlinedTextField = createComponent({
  react: React,
  tagName: 'md-outlined-text-field',
  elementClass: MdOutlinedTextField,
  events: { onTfInput: 'input', onTfChange: 'change' },
})

export const Ripple = createComponent({
  react: React,
  tagName: 'md-ripple',
  elementClass: MdRipple,
})

export const FocusRing = createComponent({
  react: React,
  tagName: 'md-focus-ring',
  elementClass: MdFocusRing,
})
