# Settings, Branding, Documents

## Platform vs Tenant Branding

- Platform: "Phoenix" branding for global marketing, login pages
- Tenant: Configurable branding per organization
- Platform brand immutable, tenant brand customizable
- Clear visual separation between platform and tenant UI

## Organization Settings Ownership

Organization settings include:

- Company name
- Logo (image upload)
- Phone number
- Email address
- Website URL
- Physical address
- Invoice templates and branding
- Report templates and branding
- SMS sender name and branding
- Portal branding and themes

## No Global Phoenix Rename

- Maintain "Phoenix" as platform brand
- Do not change global references without classification
- Tenant branding can override display names
- Code references remain "Phoenix" unless approved

## Classify Phoenix References

- Platform: Marketing, docs, global UI
- Tenant: Configurable via organization settings
- Code: Internal identifiers, API names
- Classify each reference before modification

## Generated Documents Immutable Snapshots

- Documents (invoices, reports, warranties) use snapshot data
- Branding snapshots taken at generation time
- Changes to organization settings don't affect past documents
- Document regeneration required for branding updates

## Stop Conditions

- Stop if Phoenix references changed without classification
- Halt if documents use live branding data

## Pass Criteria

- Platform/tenant branding clearly separated
- Organization settings control all tenant branding
- Phoenix references classified and protected
- Generated documents use immutable branding snapshots