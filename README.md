# Posthog Hubspot Connector ( Async ) Speakeasy adjusted:

## Description

Adjusted version of the official ubspot connector. Could be run in a cloudfunction.
Currently it is not posssible to add a plugin in the cloudversion of posthog.
Eventually call for enterprise if they are able to add it for us. 

based on https://github.com/PostHog/hubspot-plugin


Added: 
Fetching logic of the posthog api. Runs every minute to update recent events
instead of a onEvent call directly.
Additional logic implemented to map values differently and fill out the sign_up_stage for now

* Fetches recent events.
* Creates or updates a contact in hubspot 
(  Creation of a contact will be done asap from the backend in out system, updates of a user will be used to update relevant contact properties ) 
properties or custom overwrites.
* Additional logic to overwrite values
* Mappings dedicated for configured events
* sign_up_stage logic with overwrite property onlyUpdateIf to fetch a user for comparison logic
* previous functionalities are also still working with a slightly different
  configuation then befor with a slightly different configuation then before

Todo:
SetOnce for classic additionaMappings is not implemented yet, could be also solved via overwrites for now 
Custom overwrites based on function ( like calculated values). If necessary
