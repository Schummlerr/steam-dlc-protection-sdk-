-- Add production metadata for DLCs
ALTER TABLE public.dlcs 
ADD COLUMN IF NOT EXISTS bundle_name text,
ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS bundle_hash text,
ADD COLUMN IF NOT EXISTS bundle_signature text;

-- Update the existing test DLC
UPDATE public.dlcs 
SET bundle_name = 'test-dlc', enabled = true
WHERE steam_dlc_id = 123456;
