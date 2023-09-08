# Posthog Hubspot Connector ( Async ) Speakeasy adjusted:

## Description

Adjusted version of a hubspot connector. Could be run in a cloudfunction. 
Currently it is not posssible to add a plugin in the cloudversion of posthog

Additional Logic implemented to map values differently and fill out the sign_up_stage for now


based on https://github.com/PostHog/hubspot-plugin
* Fetches recent events.
* Creates or updates a contact in hubspot  
* Additional logic to overwrite values 
* Mappings dedicated for configured events
* Sign_up_stage logic possible with overwrite property onlyUpdateIf to fetch a user for comparison


Done: 
SetOnce updates for sign_up_stages are working as well as overwrites.
previous functionalities are also still working.

Todo:
SetOnce for classic additional mappings, could be also solfed via overwrites for now 
Custom overwrites based on function ( like calculated values). If necessary 