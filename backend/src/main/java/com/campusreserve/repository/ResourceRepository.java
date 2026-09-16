package com.campusreserve.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.campusreserve.entity.ResourceEntity;
import com.campusreserve.entity.ResourceType;

/**
 * 资源仓储。
 *
 * 两个列表方法都按 id 升序返回：不排序时 MySQL 的返回顺序取决于执行计划，
 * 同一个列表两次刷新顺序可能不同，用户会以为数据变了。
 * 种子数据的 id 顺序即首页「热门/推荐」的划分依据（见小程序 pages/index/index.ts），
 * 因此这里的升序也是产品语义的一部分。
 */
public interface ResourceRepository extends JpaRepository<ResourceEntity, Long> {

    /** 全部资源，按 id 升序 */
    List<ResourceEntity> findAllByOrderByIdAsc();

    /** 按类型筛选，按 id 升序（需求 §4.2「按类型筛选」） */
    List<ResourceEntity> findByTypeOrderByIdAsc(ResourceType type);
}
