public without sharing class FieldFlsHelperApex {

    public static List<ErrorRecord> errorRecords = new List<ErrorRecord>();    
    public static Map<Id, PermissionSet> profileMap = null;
    public static List<String> profilesToExclude = new List<String>{
        'Authenticated Website',
        'Chatter External User',
        'Chatter Free User',
        'Chatter Moderator User',
        'Force.com - Free User',
        'Identity User',
        'Work.com Only User',
        'Salesforce API Only System Integrations'
    };

    // fields methods
    @AuraEnabled(cacheable=true)
    public static List<labelValPair> getObjectNames()
    {                
        List<labelValPair> options = new List<labelValPair>();
        List<EntityDefinition> defs = [select Label,QualifiedApiName from EntityDefinition 
                                        where IsApexTriggerable = true and IsCustomizable = true 
                                        and IsCustomSetting = false and IsQueryable = true order by label];
        for(EntityDefinition entityDef : defs)
        {
            labelValPair opt = new labelValPair(entityDef.QualifiedApiName, entityDef.QualifiedApiName);            
            options.add(opt);
        }
                
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getFieldNames(String objName){
        try {
            Map<String, Schema.SObjectField> fMap = Schema.getGlobalDescribe().get(objName).getDescribe().Fields.getMap();

            List<String> options = new List<String>();

            List<String> fields = new List<String>(fMap.keySet());

            for(Integer i=fields.size()-1;i >= 0;i--)          
            {
                Schema.DescribeFieldResult fieldRes = fMap.get(fields[i]).getDescribe();                

                if(fieldRes.isPermissionable()){
                    options.add(objName+'.'+fieldRes.getName());
                }
            }

            return options;

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }  

    @AuraEnabled(cacheable=true)
    public static List<String> validateFields(List<String> fieldNames){
        try {

            List<String> justFieldApiNames = new List<String>();
            Set<String> objNames = new Set<String>();
            for(String field : fieldNames){
                objNames.add(field.split('\\.')[0]);
                justFieldApiNames.add(field.split('\\.')[1]);
            }

            List<String> existingFieldNames = new List<String>();

            for(FieldDefinition field : [
                Select QualifiedApiName, EntityDefinitionId, EntityDefinition.QualifiedApiName 
                from FieldDefinition 
                where QualifiedApiName in :justFieldApiNames and EntityDefinitionId in :objNames
            ]){
                existingFieldNames.add(field.EntityDefinition.QualifiedApiName+'.'+field.QualifiedApiName);
            }

            return existingFieldNames;

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Id> getPermIdAndProfileNameMap(){
        try {   
            Map<String, Id> temps = new Map<String, Id>();
            for(PermissionSet s : [
                Select Id,Name, Profile.Name, IsOwnedByProfile 
                From PermissionSet 
                where (not profile.name in :profilesToExclude) 
                and NamespacePrefix = null                
                order by IsOwnedByProfile desc, profile.name asc, name asc
            ]){
                if(s.IsOwnedByProfile == true){
                    temps.put(s.Profile.Name, s.Id);
                }else{
                    temps.put(s.Name, s.Id);
                }
            }

            return temps;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    } 

    @AuraEnabled(cacheable=true)
    public static List<FLS_Profile_Filter__mdt> getProfileFilters(){
        try {                       
            return [select Profile_Name__c, Profile_Filter_Name__c from FLS_Profile_Filter__mdt where Profile_Filter_Name__c != null];                                            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }   



    @AuraEnabled
    public static List<PermissionSet> getFLS(String profileFilter, List<String> profileNames, List<String> fieldNames, List<String> allParentIds, List<String> parentIds){
        try {             
            
            List<PermissionSet> perms = new List<PermissionSet>();           

            if(profileFilter == 'All'){
                parentIds = allParentIds;
            }
            
            for(PermissionSet perm : [
                Select Id, Name, Profile.Name,IsOwnedByProfile,
                    (Select Id, PermissionsEdit, PermissionsRead, SobjectType, ParentId,Field From fieldPerms where field in :fieldNames)
                From PermissionSet
                Where Id in :parentIds
                and (not profile.name in :profilesToExclude) 
                and NamespacePrefix = null                
                order by IsOwnedByProfile desc, profile.name asc, name asc
            ]){
                perms.add(perm);
            }

            return perms;
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static List<ErrorRecord> setFLS(List<FieldPermissions> perms){    
        errorRecords.clear();
        
        try{
            List<FieldPermissions> toBeUpsertedPerms = new List<FieldPermissions>();
            for(FieldPermissions fp : perms){                
                toBeUpsertedPerms.add(new FieldPermissions(   
                    Id=fp.Id,                             
                    ParentId=fp.ParentId,
                    Field = fp.Field,
                    SobjectType=fp.SobjectType,
                    PermissionsEdit = fp.PermissionsEdit,
                    PermissionsRead = fp.PermissionsRead
                ));                  
            }      


            Database.UpsertResult[] upsertResList = Database.upsert(toBeUpsertedPerms, false);
            System.debug('upsertResList '+upsertResList.size());
                        
            for(Integer i=0; i<upsertResList.size(); i++)
            {
                if(!upsertResList[i].isSuccess())
                {
                    storeErrors(toBeUpsertedPerms[i], upsertResList[i].getErrors()[0].getMessage());                    
                }
            }            

            return errorRecords;
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }    

    public static void storeErrors(FieldPermissions record, String errorMessage)
    {
        if(profileMap == null){
            profileMap = new Map<Id, PermissionSet>([Select Id,Name, IsOwnedByProfile, Profile.Name from PermissionSet]);
        }

        PermissionSet perm = profileMap.get(record.ParentId);        
        errorRecords.add(
            new ErrorRecord(
                record.parentId,
                perm.IsOwnedByProfile ? perm.Profile.Name : perm.Name,
                record.field,
                errorMessage
            )
        );
    }

    public class labelValPair
    {
        @AuraEnabled 
        public String label {get;set;}

        @AuraEnabled
        public String value {get;set;}

        public labelValPair(String label, String value){
            this.label = label;
            this.value = value;
        }
    }   

    public class ErrorRecord
    {
        @AuraEnabled
        public String permId {get; set;}

        @AuraEnabled
        public String name {get; set;}

        @AuraEnabled
        public String fieldName {get; set;}

        @AuraEnabled
        public String error {get; set;}

        public ErrorRecord(String permId, String name, String fieldName, String error)
        {
            this.permId = permId;
            this.name = name;
            this.fieldName = fieldName;
            this.error = error;
        }
    }
}