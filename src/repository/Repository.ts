import {Connection} from "../connection/Connection";
import {EntityMetadata} from "../metadata/EntityMetadata";
import {QueryBuilder} from "../query-builder/QueryBuilder";
import {PlainObjectToNewEntityTransformer} from "../query-builder/transformer/PlainObjectToNewEntityTransformer";
import {PlainObjectToDatabaseEntityTransformer} from "../query-builder/transformer/PlainObjectToDatabaseEntityTransformer";
import {FindOptions} from "../find-options/FindOptions";
import {FindOptionsUtils} from "../find-options/FindOptionsUtils";
import {ObjectLiteral} from "../common/ObjectLiteral";
import {QueryRunnerProvider} from "../query-runner/QueryRunnerProvider";
import {EntityPersister} from "../persistment/EntityPersister";

/**
 * Repository is supposed to work with your entity objects. Find entities, insert, update, delete, etc.
 */
export class Repository<Entity extends ObjectLiteral> {

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(protected connection: Connection,
                protected metadata: EntityMetadata,
                protected queryRunnerProvider?: QueryRunnerProvider) {
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Returns object that is managed by this repository.
     * If this repository manages entity from schema,
     * then it returns a name of that schema instead.
     */
    get target(): Function|string {
        return this.metadata.target;
    }

    /**
     * Checks if entity has an id.
     * If entity contains compose ids, then it checks them all.
     */
    hasId(entity: Entity): boolean {
        // if (this.metadata.parentEntityMetadata) {
        //     return this.metadata.parentEntityMetadata.parentIdColumns.every(parentIdColumn => {
        //         const columnName = parentIdColumn.propertyName;
        //         return !!entity &&
        //             entity.hasOwnProperty(columnName) &&
        //             entity[columnName] !== null &&
        //             entity[columnName] !== undefined &&
        //             entity[columnName] !== "";
        //     });

        // } else {
            return this.metadata.primaryColumns.every(primaryColumn => {
                const columnName = primaryColumn.propertyName;
                return !!entity &&
                    entity.hasOwnProperty(columnName) &&
                    entity[columnName] !== null &&
                    entity[columnName] !== undefined &&
                    entity[columnName] !== "";
            });
        // }
    }

    /**
     * Creates a new query builder that can be used to build a sql query.
     */
    createQueryBuilder(alias: string): QueryBuilder<Entity> {
        return new QueryBuilder<Entity>(this.connection/*, dbConnection*/)
            .select(alias)
            .from(this.metadata.target, alias);
    }

    /**
     * Creates a new entity instance.
     */
    create(): Entity;

    /**
     * Creates a new entities and copies all entity properties from given objects into their new entities.
     * Note that it copies only properties that present in entity schema.
     */
    create(plainObjects: Object[]): Entity[];

    /**
     * Creates a new entity instance and copies all entity properties from this object into a new entity.
     * Note that it copies only properties that present in entity schema.
     */
    create(plainObject: Object): Entity;

    /**
     * Creates a new entity instance or instances.
     * Can copy properties from the given object into new entities.
     */
    create(plainObjectOrObjects?: Object|Object[]): Entity|Entity[] {
        if (plainObjectOrObjects instanceof Array)
            return plainObjectOrObjects.map(object => this.create(object as Object));

        const newEntity: Entity = this.metadata.create();
        if (plainObjectOrObjects) {
            const plainObjectToEntityTransformer = new PlainObjectToNewEntityTransformer();
            plainObjectToEntityTransformer.transform(newEntity, plainObjectOrObjects, this.metadata);
        }

        return newEntity;
    }

    /**
     * Creates a new entity from the given plan javascript object. If entity already exist in the database, then
     * it loads it (and everything related to it), replaces all values with the new ones from the given object
     * and returns this new entity. This new entity is actually a loaded from the db entity with all properties
     * replaced from the new object.
     */
    preload(object: Object): Promise<Entity> {
        const queryBuilder = this.createQueryBuilder(this.metadata.table.name);
        const plainObjectToDatabaseEntityTransformer = new PlainObjectToDatabaseEntityTransformer();
        return plainObjectToDatabaseEntityTransformer.transform(object, this.metadata, queryBuilder);
    }

    /**
     * Merges multiple entities (or entity-like objects) into a one new entity.
     */
    merge(...objects: ObjectLiteral[]): Entity {
        const newEntity: Entity = this.metadata.create();
        const plainObjectToEntityTransformer = new PlainObjectToNewEntityTransformer();
        objects.forEach(object => plainObjectToEntityTransformer.transform(newEntity, object, this.metadata));
        return newEntity;
    }

    /**
     * Persists (saves) all given entities in the database.
     * If entities do not exist in the database then inserts, otherwise updates.
     */
    async persist(entities: Entity[]): Promise<Entity[]>;

    /**
     * Persists (saves) a given entity in the database.
     * If entity does not exist in the database then inserts, otherwise updates.
     */
    async persist(entity: Entity): Promise<Entity>;

    /**
     * Persists one or many given entities.
     */
    async persist(entityOrEntities: Entity|Entity[]): Promise<Entity|Entity[]> {

        // if multiple entities given then go throw all of them and save them
        if (entityOrEntities instanceof Array)
            return Promise.all(entityOrEntities.map(entity => this.persist(entity)));

        const queryRunnerProvider = this.queryRunnerProvider || new QueryRunnerProvider(this.connection.driver);
        const queryRunner = await queryRunnerProvider.provide();
        try {
            const entityPersister = new EntityPersister<Entity>(this.connection, this.metadata, queryRunner);
            return await entityPersister.persist(entityOrEntities); // await is needed here because we are using finally
            // if (this.hasId(entityOrEntities)) {
            //     return await entityPersister.update(entityOrEntities); // await is needed here because we are using finally
            // } else {
            //     return await entityPersister.insert(entityOrEntities); // await is needed here because we are using finally
            // }

        } finally {
            await queryRunnerProvider.release(queryRunner);
        }
    }

    /**
     * Removes a given entities from the database.
     */
    async remove(entities: Entity[]): Promise<Entity[]>;

    /**
     * Removes a given entity from the database.
     */
    async remove(entity: Entity): Promise<Entity>;

    /**
     * Removes one or many given entities.
     */
    async remove(entityOrEntities: Entity|Entity[]): Promise<Entity|Entity[]> {

        // if multiple entities given then go throw all of them and save them
        if (entityOrEntities instanceof Array)
            return Promise.all(entityOrEntities.map(entity => this.remove(entity)));

        const queryRunnerProvider = this.queryRunnerProvider || new QueryRunnerProvider(this.connection.driver, true);
        const queryRunner = await queryRunnerProvider.provide();
        try {
            const entityPersister = new EntityPersister<Entity>(this.connection, this.metadata, queryRunner);
            return await entityPersister.remove(entityOrEntities); // await is needed here because we are using finally

        } finally {
            await queryRunnerProvider.release(queryRunner);
        }
    }

    /**
     * Finds all entities.
     */
    async find(): Promise<Entity[]>;

    /**
     * Finds entities that match given conditions.
     */
    async find(conditions: ObjectLiteral): Promise<Entity[]>;

    /**
     * Finds entities with given find options.
     */
    async find(options: FindOptions): Promise<Entity[]>;

    /**
     * Finds entities that match given conditions and find options.
     */
    async find(conditions: ObjectLiteral, options: FindOptions): Promise<Entity[]>;

    /**
     * Finds entities that match given conditions and/or find options.
     */
    async find(conditionsOrFindOptions?: ObjectLiteral|FindOptions, options?: FindOptions): Promise<Entity[]> {
        return this.createFindQueryBuilder(conditionsOrFindOptions, options)
            .getResults();
    }

    /**
     * Finds entities that match given conditions.
     * Also counts all entities that match given conditions,
     * but ignores pagination settings (maxResults, firstResult) options.
     */
    async findAndCount(): Promise<[ Entity[], number ]>;

    /**
     * Finds entities that match given conditions.
     * Also counts all entities that match given conditions,
     * but ignores pagination settings (maxResults, firstResult) options.
     */
    async findAndCount(conditions: ObjectLiteral): Promise<[ Entity[], number ]>;

    /**
     * Finds entities that match given conditions.
     * Also counts all entities that match given conditions,
     * but ignores pagination settings (maxResults, firstResult) options.
     */
    async findAndCount(options: FindOptions): Promise<[ Entity[], number ]>;

    /**
     * Finds entities that match given conditions.
     * Also counts all entities that match given conditions,
     * but ignores pagination settings (maxResults, firstResult) options.
     */
    async findAndCount(conditions: ObjectLiteral, options: FindOptions): Promise<[ Entity[], number ]>;

    /**
     * Finds entities that match given conditions.
     * Also counts all entities that match given conditions,
     * but ignores pagination settings (maxResults, firstResult) options.
     */
    async findAndCount(conditionsOrFindOptions?: ObjectLiteral|FindOptions, options?: FindOptions): Promise<[ Entity[], number ]> {
        return this.createFindQueryBuilder(conditionsOrFindOptions, options)
            .getResultsAndCount();
    }

    /**
     * Finds first entity that matches given conditions.
     */
    async findOne(): Promise<Entity>;

    /**
     * Finds first entity that matches given conditions.
     */
    async findOne(conditions: ObjectLiteral): Promise<Entity>;

    /**
     * Finds first entity that matches given find options.
     */
    async findOne(options: FindOptions): Promise<Entity>;

    /**
     * Finds first entity that matches given conditions and find options.
     */
    async findOne(conditions: ObjectLiteral, options: FindOptions): Promise<Entity>;

    /**
     * Finds first entity that matches given conditions and/or find options.
     */
    async findOne(conditionsOrFindOptions?: ObjectLiteral|FindOptions, options?: FindOptions): Promise<Entity> {
        return this.createFindQueryBuilder(conditionsOrFindOptions, options)
            .getSingleResult();
    }

    /**
     * Finds entity with given id.
     * Optionally find options can be applied.
     */
    async findOneById(id: any, options?: FindOptions): Promise<Entity> {
        const conditions: ObjectLiteral = {};
        if (this.metadata.hasMultiplePrimaryKeys) {
            this.metadata.primaryColumns.forEach(primaryColumn => {
                conditions[primaryColumn.name] = id[primaryColumn.name];
            });
            this.metadata.parentIdColumns.forEach(primaryColumn => {
                conditions[primaryColumn.name] = id[primaryColumn.propertyName];
            });
        } else {
            if (this.metadata.primaryColumns.length > 0) {
                conditions[this.metadata.firstPrimaryColumn.name] = id;
            } else if (this.metadata.parentIdColumns.length > 0) {
                conditions[this.metadata.parentIdColumns[0].name] = id;
            }
        }
        return this.createFindQueryBuilder(conditions, options)
            .getSingleResult();
    }

    /**
     * Executes a raw SQL query and returns a raw database results.
     */
    async query(query: string): Promise<any> {
        const queryRunnerProvider = this.queryRunnerProvider || new QueryRunnerProvider(this.connection.driver);
        const queryRunner = await queryRunnerProvider.provide();
        try {
            return await queryRunner.query(query); // await is needed here because we are using finally

        } finally {
            await queryRunnerProvider.release(queryRunner);
        }
    }

    /**
     * Wraps given function execution (and all operations made there) in a transaction.
     * All database operations must be executed using provided repository.
     */
    async transaction(runInTransaction: (repository: Repository<Entity>) => Promise<any>|any): Promise<any> {
        const queryRunnerProvider = this.queryRunnerProvider || new QueryRunnerProvider(this.connection.driver, true);
        const queryRunner = await queryRunnerProvider.provide();
        const transactionRepository = new Repository<Entity>(this.connection, this.metadata, queryRunnerProvider);

        try {
            await queryRunner.beginTransaction();
            const result = await runInTransaction(transactionRepository);
            await queryRunner.commitTransaction();
            return result;

        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;

        } finally {
            await queryRunnerProvider.release(queryRunner);
            if (!this.queryRunnerProvider) // if we used a new query runner provider then release it
                await queryRunnerProvider.releaseReused();
        }
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Creates a query builder from the given conditions or find options.
     * Used to create a query builder for find* methods.
     */
    protected createFindQueryBuilder(conditionsOrFindOptions?: Object|FindOptions, options?: FindOptions): QueryBuilder<Entity> {
        const findOptions = FindOptionsUtils.isFindOptions(conditionsOrFindOptions) ? conditionsOrFindOptions : options as FindOptions;
        const conditions = FindOptionsUtils.isFindOptions(conditionsOrFindOptions) ? undefined : conditionsOrFindOptions;

        const alias = findOptions ? findOptions.alias : this.metadata.table.name;
        const qb = this.createQueryBuilder(alias);

        // if find options are given then apply them to query builder
        if (findOptions)
            FindOptionsUtils.applyOptionsToQueryBuilder(qb, findOptions);

        // if conditions are given then apply them to query builder
        if (conditions) {
            Object.keys(conditions).forEach(key => {
                const name = key.indexOf(".") === -1 ? alias + "." + key : key;
                qb.andWhere(name + "=:" + key);
            });
            qb.addParameters(conditions);
        }

        return qb;
    }

}