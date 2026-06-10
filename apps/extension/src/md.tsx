// Thin React wrappers around the @material/web (Lit) custom elements.
// Importing each element module registers its custom element; createComponent
// from @lit/react maps React props to element properties and custom events to
// onX props (needed even on React 19 for clean event/property handling).
import { createComponent } from '@lit/react'
import { MdFilledButton } from '@material/web/button/filled-button.js'
import { MdOutlinedButton } from '@material/web/button/outlined-button.js'
import { MdTextButton } from '@material/web/button/text-button.js'
import { MdCheckbox } from '@material/web/checkbox/checkbox.js'
import { MdDialog } from '@material/web/dialog/dialog.js'
import { MdDivider } from '@material/web/divider/divider.js'
import { MdFab } from '@material/web/fab/fab.js'
import { MdIconButton } from '@material/web/iconbutton/icon-button.js'
import { MdList } from '@material/web/list/list.js'
import { MdListItem } from '@material/web/list/list-item.js'
import { MdMenu } from '@material/web/menu/menu.js'
import { MdMenuItem } from '@material/web/menu/menu-item.js'
import { MdRadio } from '@material/web/radio/radio.js'
import { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js'
import * as React from 'react'

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

export const Checkbox = createComponent({
  react: React,
  tagName: 'md-checkbox',
  elementClass: MdCheckbox,
  events: { onChange: 'change' },
})

export const Radio = createComponent({
  react: React,
  tagName: 'md-radio',
  elementClass: MdRadio,
  events: { onChange: 'change' },
})

export const OutlinedButton = createComponent({
  react: React,
  tagName: 'md-outlined-button',
  elementClass: MdOutlinedButton,
})
