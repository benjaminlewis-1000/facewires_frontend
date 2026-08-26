import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import MutableSelect from './mutableSelect';
import store from 'store';
import { useContextMenu, Menu, Item } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import { withRetry } from './apiRetry';
import axiosInstance from './axios_setup';

class LazyImage extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      loaded: false,
      type: this.props.type,
    };

    this.localClick = this.localClick.bind(this);
    this.otherAssignment = this.otherAssignment.bind(this);
    this.cancelOtherAssignment = this.cancelOtherAssignment.bind(this);
    this.set_as_thumbnail = this.set_as_thumbnail.bind(this);
    this.set_invisible = this.set_invisible.bind(this);
    // Bound once so it's a stable prop reference across renders (mutable_select
    // is rebuilt inline in render() every time, so anything passed to it needs
    // to already be stable going in for MutableSelect's own memoization - see
    // mutableSelect.jsx - to actually do anything). Was previously setting
    // local state LazyImage never reads/renders anywhere - forwards to the
    // real error banner in gallery.jsx instead, same as set_as_thumbnail's
    // catch already does below.
    this.handleMutableSelectError = (msg) => { this.props.onApiError && this.props.onApiError(msg) };
    // this.get_unique_list = this.get_unique_list.bind(this);
  }

  set_as_thumbnail() {
    var thumbnail_url = store.get('api_url') + '/faces/' + this.props.face_id + '/set_as_person_thumbnail/';
    withRetry(() => axiosInstance.put(thumbnail_url))
      .then(response => {
        this.props.onHighlightUpdated && this.props.onHighlightUpdated();
      })
      .catch(error => {
        console.log("Error in set as thumbnail", error);
        this.props.onApiError && this.props.onApiError("Couldn't set thumbnail — please try again.");
      });
  }

  set_invisible() {
    this.setState({ ignored: true });
  }

  localClick(event) {
    this.props.onClick(event, this.props.face_id, this.props.index);
  }

  otherAssignment() {
    this.setState({ type: 'unassigned_tab' });
  }

  // Escape in the person-search box (MutableSelect) calls this to back
  // the tile fully out of "send to other person" mode - reverting to
  // the original type flips the render switch below back to the tile's
  // normal confirm/reject buttons, unmounting MutableSelect.
  cancelOtherAssignment() {
    this.setState({ type: this.props.type });
  }

  render() {
    // Unique menu id per image instance to avoid collisions
    const menuId = `menu-face-${this.props.face_id}-${this.props.index}`;

    var mutable_select = <MutableSelect
      peopleOptions={this.props.peopleOptions}
      get_unique_list={this.props.get_unique_list}
      face_id={this.props.face_id}
      type={this.props.type}
      current_person_id={this.props.current_person_id}
      unassigned_person_id={this.props.unassigned_person_id}
      ignore_person_id={this.props.ignore_person_id}
      ignore_tab={this.props.ignore_tab}
      only_unverified={this.props.only_unverified}
      setInvisible={this.set_invisible}
      onCancel={this.cancelOtherAssignment}
      setHidden={this.props.setHidden}
      updatePersonList={this.props.updatePersonList}
      updatePersonCounts={this.props.updatePersonCounts}
      onRecordUndo={this.props.onRecordUndo}
      imgsSelected={this.props.imgsSelected}
      clearImagesSelected={this.props.clearImagesSelected}
      // get_unique_list={this.get_unique_list}
      onApiError={this.handleMutableSelectError}
    />;
      
    return (
      <div className={(this.props.hidden || this.state.ignored) ? 'hidden_img' : 'imgDiv'}>
        <LazyImageContextWrapper 
          menuId={menuId}
          hidden={this.props.hidden}
          ignored={this.state.ignored}
          selected={this.props.selected}
          url={this.props.url}
          index={this.props.index}
          scrollPosition={this.props.scrollPosition}
          localClick={this.localClick}
          onDrop={this.props.onDrop}
          onDrag={this.props.onDrag}
          loaded={this.state.loaded}
          onLoad={() => this.setState({ loaded: true })}
        />
   
        <Menu id={menuId}>
          <Item onClick={ () => this.props.api_action('close_assigned', this.props.face_id) }>
            Remove from person
          </Item>
          <Item onClick={ () => this.props.api_action('close_unassigned', this.props.face_id) }>
            Send to ignore
          </Item>
          <Item onClick={ this.otherAssignment }>
            Send to other person
          </Item>
          <Item onClick={ () => this.props.api_action('verify_face', this.props.face_id) }>
            Verify face
          </Item>
          <Item onClick={ this.set_as_thumbnail }>
            Set as highlight image
          </Item>
        </Menu>
        
        {/* ignore_tab overrides state.type entirely for both slots, rather
            than being folded into the type switch below - the ignore
            person's gallery mixes 'defined' tiles (already-ignored faces,
            from face_declared) and 'proposed' tiles (possible-match
            candidates for '.ignore', from face_poss - fetched for every
            person's gallery whenever only_unverified is off, ignore
            person included), and both need the same controls here
            regardless of which one a given tile happens to be. There's no
            literal 'ignored' type anywhere (gallery.jsx's fetchMoreData
            only ever assigns 'unassigned_tab' / 'defined' / 'proposed') -
            an 'ignored' case in the type switch below would just never
            match. The Unassigned tab doesn't have this mixing problem -
            fetchMoreData already forces every one of its tiles to type
            'unassigned_tab', declared or possible alike - so it's fine to
            stay a normal case in the switch. */}
        {
          this.props.ignore_tab ? mutable_select : {
            'proposed': <button className={this.props.hidden ? 'hidden_img' : 'yes'}
                        onClick={ (e) => {this.props.api_action('confirm_proposed', this.props.face_id) } }
                        >
                        &#10003;
                        </button>,
            'unassigned_tab': mutable_select,
          }[this.state.type]
        }
        {
          this.props.ignore_tab ? (
            <button className={this.props.hidden ? 'hidden_img' : 'delete'}
                    onClick={ (e)=>{this.props.api_action('close_ignored', this.props.face_id) } }
                    >
                    x
                    </button>
          ) : {
            'proposed': <button className={this.props.hidden ? 'hidden_img' : 'no'}
                        onClick={ (e)=>{this.props.api_action('close_assigned', this.props.face_id) } }
                        >
                        x
                        </button>,
          }[this.state.type]
        }
      </div>
    );
  }
}

// Functional wrapper to leverage react-contexify's hook cleanly inside a Class Component
const LazyImageContextWrapper = React.memo(function LazyImageContextWrapper({ menuId, hidden, ignored, selected, url, index, scrollPosition, localClick, onDrop, onDrag, loaded, onLoad }) {
  const { show } = useContextMenu({ id: menuId });

  function handleContextMenu(event) {
    show({ event });
  }

  return (
    <div onContextMenu={handleContextMenu}>
      <LazyImageComponent
        hidden={hidden}
        ignored={ignored}
        selected={selected}
        url={url}
        index={index}
        scrollPosition={scrollPosition}
        localClick={localClick}
        onDrop={onDrop}
        onDrag={onDrag}
        loaded={loaded}
        onLoad={onLoad}
      />
    </div>
  );
});

const LazyImageComponent = React.memo(function LazyImageComponent({ hidden, ignored, selected, url, index, scrollPosition, localClick, onDrop, onDrag, loaded, onLoad }) {
  return (
    <LazyLoadImage 
      className={(hidden || ignored) ? 'hidden_img' : selected ? 'img_thumb_active' : 'img_thumb'} 
      src={url} 
      key={index}
      effect='blur'
      scrollPosition={scrollPosition}
      onClick={(e) => localClick(e)}
      onDrop={onDrop}
      onDrag={onDrag}
      wrapperClassName={loaded ? 'loaded' : 'loading'}
      afterLoad={onLoad}
    />
  );
});

export default LazyImage;
